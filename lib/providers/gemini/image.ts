/**
 * Google Gemini image adapter ("Nano Banana"), raw HTTP against the
 * Interactions API. Checked against ai.google.dev / aistudio.google.com docs on
 * 2026-11-20:
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   headers: x-goog-api-key, Api-Revision: 2026-05-20
 *   body: { model, input: [{type:"text"}, {type:"image", mime_type, data}], response_format: {type:"image", aspect_ratio, image_size}, store }
 *   output: steps[] -> type "model_output" -> content[] -> {type:"image", data, mime_type}
 * Interactions are stored for 55 days by default; we always send store=false.
 */
import sharp from "sharp";
import { referenceImages, type CharacterSheetRequest, type EditRequest, type IllustrationRequest, type ImageProvider } from "../image/types";
import { buildCharacterSheetPrompt, buildEditPrompt, buildIllustrationPrompt, nearestAspect } from "../image/prompt";
import { PermanentProviderError, type ImageData, type Usage, type WithUsage } from "../types";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_API_REVISION = "2026-05-20";

/** Aspect ratios accepted by Nano Banana 2.1 (the extreme 1:4/4:1/1:8/8:1 are never useful for a book). */
export const GEMINI_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

export type GeminiSize = "1K" | "2K" | "4K";

/** Long edge in pixels at 2K for each aspect ratio (docs table). 1K is half, 4K is double. */
const LONG_EDGE_2K: Record<string, number> = {
  "1:1": 2048, "2:3": 2528, "3:2": 2528, "3:4": 2400, "4:3": 2400, "4:5": 2304, "5:4": 2304, "9:16": 2752, "16:9": 2752, "21:9": 3168,
};
const SIZE_FACTOR: Record<GeminiSize, number> = { "1K": 0.5, "2K": 1, "4K": 2 };

/**
 * USD per output image by size, and per input image, from the pricing page.
 * Keyed by model; unknown models use the most expensive row.
 */
export const GEMINI_PRICES: Record<string, { out: Record<GeminiSize, number>; perInputImage: number }> = {
  "gemini-nano-banana-2.1": { out: { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 }, perInputImage: 0.0017 },
  "gemini-3.1-flash-image": { out: { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 }, perInputImage: 0.0017 },
  "gemini-3-pro-image": { out: { "1K": 0.134, "2K": 0.134, "4K": 0.24 }, perInputImage: 0.0011 },
};

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Output size for final page art. "auto" picks the smallest size that reaches ~85% of print pixels. */
  pageSize: GeminiSize | "auto";
  fetchImpl?: typeof fetch;
}

interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mime_type?: string;
}

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GeminiOptions) {
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private price() {
    return GEMINI_PRICES[this.model] ?? GEMINI_PRICES["gemini-3-pro-image"];
  }

  /**
   * Chooses an output size for the print target: the smallest size whose long
   * edge reaches 85% of the print pixels (the upscaler covers the rest).
   */
  sizeFor(target?: { widthPx: number; heightPx: number }): GeminiSize {
    if (this.opts.pageSize !== "auto") return this.opts.pageSize;
    if (!target) return "2K";
    const aspect = nearestAspect(target.widthPx / target.heightPx, GEMINI_ASPECTS);
    const needed = Math.max(target.widthPx, target.heightPx);
    for (const s of ["1K", "2K", "4K"] as GeminiSize[]) {
      if (LONG_EDGE_2K[aspect] * SIZE_FACTOR[s] >= needed * 0.85) return s;
    }
    return "4K";
  }

  /** Builds the request body. Exported via the class for payload tests. */
  buildBody(prompt: string, images: ImageData[], aspect: number, size: GeminiSize) {
    return {
      model: this.model,
      input: [
        { type: "text", text: prompt },
        ...images.map((img) => ({ type: "image", mime_type: img.mimeType, data: img.data.toString("base64") })),
      ],
      // The live API accepts only image/jpeg here (it rejects image/png with HTTP 400).
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: nearestAspect(aspect, GEMINI_ASPECTS), image_size: size },
      store: false,
    };
  }

  private async call(prompt: string, images: ImageData[], aspect: number, size: GeminiSize): Promise<WithUsage<ImageData>> {
    for (const img of images) {
      if (img.mimeType !== "image/png" && img.mimeType !== "image/jpeg" && img.mimeType !== "image/webp") {
        throw new PermanentProviderError(`Gemini cannot take ${img.mimeType} reference images`);
      }
    }
    const res = await this.fetchImpl(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": this.opts.apiKey, "Content-Type": "application/json", "Api-Revision": GEMINI_API_REVISION },
      body: JSON.stringify(this.buildBody(prompt, images, aspect, size)),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const msg = `Gemini image request failed (HTTP ${res.status}): ${detail}`;
      // 429 and 5xx are worth retrying; other client errors will fail again.
      if (res.status === 429 || res.status >= 500) throw new Error(msg);
      throw new PermanentProviderError(msg);
    }
    const json = (await res.json()) as { steps?: Array<{ type: string; content?: ContentBlock[] }>; output_image?: ContentBlock };
    const image = extractImage(json);
    if (!image?.data) {
      const text = (json.steps ?? [])
        .flatMap((s) => (s.type === "model_output" ? (s.content ?? []) : []))
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join(" ")
        .slice(0, 200);
      throw new PermanentProviderError(`The image service did not return a picture${text ? `: ${text}` : ""}. Try rewording the scene or note.`);
    }
    const data = Buffer.from(image.data, "base64");
    const meta = await sharp(data).metadata();
    const p = this.price();
    const usage: Usage = {
      provider: this.name,
      model: this.model,
      imageCalls: 1,
      costUsd: Math.round((p.out[size] + images.length * p.perInputImage) * 1e6) / 1e6,
    };
    // Trust the bytes, not the label.
    const mimeType = meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : "image/jpeg";
    return { value: { data, mimeType, width: meta.width ?? 0, height: meta.height ?? 0 }, usage };
  }

  async generateCharacterSheet(input: CharacterSheetRequest): Promise<WithUsage<ImageData[]>> {
    const results: ImageData[] = [];
    let cost = 0;
    for (let i = 0; i < input.count; i++) {
      const r = await this.call(buildCharacterSheetPrompt({ style: input.style, outfit: input.outfit, variant: i, subject: input.subject }), input.photos.slice(0, 4), 3 / 2, "2K");
      results.push(r.value);
      cost += r.usage.costUsd;
    }
    return { value: results, usage: { provider: this.name, model: this.model, imageCalls: input.count, costUsd: Math.round(cost * 1e6) / 1e6 } };
  }

  generateIllustration(req: IllustrationRequest): Promise<WithUsage<ImageData>> {
    return this.call(buildIllustrationPrompt(req), referenceImages(req), req.aspect, this.sizeFor(req.targetPx));
  }

  editIllustration(input: EditRequest): Promise<WithUsage<ImageData>> {
    const prompt = buildEditPrompt({ instruction: input.instruction, style: input.style, childName: input.childName, hasCharacterRef: !!input.characterRef, textZone: input.textZone });
    const aspect = input.image.width && input.image.height ? input.image.width / input.image.height : 1;
    return this.call(prompt, input.characterRef ? [input.image, input.characterRef] : [input.image], aspect, this.sizeFor(input.targetPx));
  }
}

/** The last image produced by the model (thought images are skipped). */
export function extractImage(json: { steps?: Array<{ type: string; content?: ContentBlock[] }>; output_image?: ContentBlock }): ContentBlock | null {
  let last: ContentBlock | null = null;
  for (const step of json.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const c of step.content ?? []) if (c.type === "image" && c.data) last = c;
  }
  return last ?? (json.output_image?.data ? json.output_image : null);
}
