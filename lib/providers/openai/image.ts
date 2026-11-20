/**
 * OpenAI GPT Image adapter, raw HTTP. Checked against developers.openai.com on
 * 2026-11-20:
 *   models: gpt-image-2.6-sunburst (editing precision), gpt-image-2.6-flare (fast)
 *   POST /v1/images/generations  JSON  { model, prompt, size, quality, output_format, moderation, n }
 *   POST /v1/images/edits        multipart: model, prompt, image[] (repeat), size, quality, output_format
 *   size: "WxH", multiples of 16, edges <= 3840, ratio 1:3..3:1, 655,360..8,294,400 pixels
 *   quality: low | medium | high | xhigh | max | auto
 *   response: data[0].b64_json, usage (tokens)
 *   price per 1M tokens: text in $5, image in $8, image out $30
 * API data is not used for training by default; abuse logs kept up to 30 days.
 */
import sharp from "sharp";
import type { CharacterSheetRequest, EditRequest, IllustrationRequest, ImageProvider } from "../image/types";
import { buildCharacterSheetPrompt, buildEditPrompt, buildIllustrationPrompt } from "../image/prompt";
import { PermanentProviderError, type ImageData, type Usage, type WithUsage } from "../types";

export const OPENAI_BASE = "https://api.openai.com/v1";
export const OPENAI_TOKEN_PRICES = { textIn: 5, imageIn: 8, imageOut: 30 };
/** Used when the response carries no usage block. High-side guess per image. */
const FALLBACK_COST_PER_IMAGE = 0.3;

export type OpenAIQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export interface OpenAIImageOptions {
  apiKey: string;
  model: string;
  quality: OpenAIQuality;
  fetchImpl?: typeof fetch;
}

const MAX_EDGE = 3840;
const MAX_PIXELS = 8_294_400;
const MIN_PIXELS = 655_360;

/** Largest valid "WxH" for the requested aspect, capped at the print target when given. */
export function openAISize(aspect: number, target?: { widthPx: number; heightPx: number }): string {
  const a = Math.min(3, Math.max(1 / 3, aspect));
  let h = Math.sqrt(MAX_PIXELS / a);
  let w = h * a;
  if (w > MAX_EDGE) {
    w = MAX_EDGE;
    h = w / a;
  }
  if (h > MAX_EDGE) {
    h = MAX_EDGE;
    w = h * a;
  }
  if (target && target.widthPx < w) {
    w = target.widthPx;
    h = w / a;
  }
  const r16 = (n: number) => Math.max(16, Math.floor(n / 16) * 16);
  let W = r16(w);
  let H = r16(h);
  while (W * H < MIN_PIXELS) {
    W += 16;
    H = r16(W / a);
  }
  return `${W}x${H}`;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };
  error?: { code?: string; message?: string };
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OpenAIImageOptions) {
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private cost(u: OpenAIImageResponse["usage"]): number {
    if (!u?.output_tokens) return FALLBACK_COST_PER_IMAGE;
    const textIn = u.input_tokens_details?.text_tokens ?? 0;
    const imageIn = u.input_tokens_details?.image_tokens ?? Math.max(0, (u.input_tokens ?? 0) - textIn);
    const usd = (textIn * OPENAI_TOKEN_PRICES.textIn + imageIn * OPENAI_TOKEN_PRICES.imageIn + u.output_tokens * OPENAI_TOKEN_PRICES.imageOut) / 1_000_000;
    return Math.round(usd * 1e6) / 1e6;
  }

  /** Multipart body for /images/edits. Exposed for payload tests. */
  buildEditForm(prompt: string, images: ImageData[], size: string): FormData {
    const form = new FormData();
    form.append("model", this.model);
    form.append("prompt", prompt);
    images.forEach((img, i) => {
      const ext = img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png";
      form.append("image[]", new Blob([new Uint8Array(img.data)], { type: img.mimeType }), `ref-${i}.${ext}`);
    });
    form.append("size", size);
    form.append("quality", this.opts.quality);
    form.append("output_format", "png");
    form.append("n", "1");
    return form;
  }

  /** JSON body for /images/generations. Exposed for payload tests. */
  buildGenerationBody(prompt: string, size: string) {
    return { model: this.model, prompt, size, quality: this.opts.quality, output_format: "png", moderation: "auto", n: 1 };
  }

  private async call(prompt: string, images: ImageData[], aspect: number, target?: { widthPx: number; heightPx: number }): Promise<WithUsage<ImageData>> {
    const size = openAISize(aspect, target);
    const headers = { Authorization: `Bearer ${this.opts.apiKey}` };
    const res = images.length
      ? await this.fetchImpl(`${OPENAI_BASE}/images/edits`, { method: "POST", headers, body: this.buildEditForm(prompt, images, size) })
      : await this.fetchImpl(`${OPENAI_BASE}/images/generations`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(this.buildGenerationBody(prompt, size)),
        });
    const json = (await res.json().catch(() => ({}))) as OpenAIImageResponse;
    if (!res.ok) {
      const code = json.error?.code ?? "";
      const msg = `OpenAI image request failed (HTTP ${res.status}${code ? `, ${code}` : ""}): ${(json.error?.message ?? "").slice(0, 300)}`;
      if (code === "moderation_blocked") throw new PermanentProviderError("The image service declined this picture. Try rewording the scene or note.");
      if (res.status === 429 || res.status >= 500) throw new Error(msg);
      throw new PermanentProviderError(msg);
    }
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image data");
    const data = Buffer.from(b64, "base64");
    const meta = await sharp(data).metadata();
    const usage: Usage = { provider: this.name, model: this.model, imageCalls: 1, inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens, costUsd: this.cost(json.usage) };
    return { value: { data, mimeType: "image/png", width: meta.width ?? 0, height: meta.height ?? 0 }, usage };
  }

  async generateCharacterSheet(input: CharacterSheetRequest): Promise<WithUsage<ImageData[]>> {
    const out: ImageData[] = [];
    let cost = 0;
    for (let i = 0; i < input.count; i++) {
      const r = await this.call(buildCharacterSheetPrompt({ style: input.style, outfit: input.outfit, variant: i }), input.photos.slice(0, 4), 3 / 2, { widthPx: 2048, heightPx: 1365 });
      out.push(r.value);
      cost += r.usage.costUsd;
    }
    return { value: out, usage: { provider: this.name, model: this.model, imageCalls: input.count, costUsd: Math.round(cost * 1e6) / 1e6 } };
  }

  generateIllustration(req: IllustrationRequest): Promise<WithUsage<ImageData>> {
    return this.call(buildIllustrationPrompt(req), req.characterRef ? [req.characterRef] : [], req.aspect, req.targetPx);
  }

  editIllustration(input: EditRequest): Promise<WithUsage<ImageData>> {
    const prompt = buildEditPrompt({ instruction: input.instruction, style: input.style, childName: input.childName, hasCharacterRef: !!input.characterRef, textZone: input.textZone });
    const aspect = input.image.width && input.image.height ? input.image.width / input.image.height : 1;
    return this.call(prompt, input.characterRef ? [input.image, input.characterRef] : [input.image], aspect, input.targetPx);
  }
}
