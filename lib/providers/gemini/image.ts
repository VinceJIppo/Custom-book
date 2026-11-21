/**
 * Google Gemini image adapter ("Nano Banana"), raw HTTP against the
 * Interactions API. Checked against ai.google.dev / aistudio.google.com docs on
 * 2026-11-20:
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   headers: x-goog-api-key, Api-Revision: 2026-05-20
 *   body: { model, input: [{type:"text"}, {type:"image", mime_type, data}], response_format: {type:"image", aspect_ratio, image_size}, store }
 *   output: steps[] -> type "model_output" -> content[] -> {type:"image", data, mime_type}
 * Interactions are stored for 55 days by default; we always send store=false.
 *
 * Overnight books use Batch Mode (generateContent requests, inlined), per the
 * official @google/genai SDK's REST mapping (checked 2026-11-21):
 *   POST {base}/models/{model}:batchGenerateContent
 *     body: { batch: { displayName, inputConfig: { requests: { requests: [{ request, metadata }] } } } }
 *   GET  {base}/batches/{id}  -> { name, done, metadata: { state: BATCH_STATE_*, output: { inlinedResponses: { inlinedResponses: [{ response, error, metadata }] } } } }
 * Batch Mode is billed at 50% of the standard price; the target turnaround is 24 hours.
 */
import sharp from "sharp";
import { referenceImages, type BatchImageProvider, type BatchItem, type BatchResult, type BatchState, type CharacterSheetRequest, type EditRequest, type IllustrationRequest, type ImageProvider } from "../image/types";
import { buildCharacterSheetPrompt, buildEditPrompt, buildIllustrationPrompt, nearestAspect } from "../image/prompt";
import { PermanentProviderError, type ImageData, type Usage, type WithUsage } from "../types";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_API_REVISION = "2026-05-20";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Batch Mode price as a share of the standard price. */
export const GEMINI_BATCH_DISCOUNT = 0.5;
/** Inlined batch requests are limited to 20 MB in total; stay under it and split if needed. */
export const GEMINI_BATCH_MAX_BYTES = 18 * 1024 * 1024;

const BATCH_STATES: Record<string, BatchState> = {
  BATCH_STATE_PENDING: "pending",
  BATCH_STATE_RUNNING: "running",
  BATCH_STATE_SUCCEEDED: "succeeded",
  BATCH_STATE_FAILED: "failed",
  BATCH_STATE_CANCELLED: "cancelled",
  BATCH_STATE_EXPIRED: "expired",
  JOB_STATE_PENDING: "pending",
  JOB_STATE_RUNNING: "running",
  JOB_STATE_SUCCEEDED: "succeeded",
  JOB_STATE_FAILED: "failed",
  JOB_STATE_CANCELLED: "cancelled",
  JOB_STATE_EXPIRED: "expired",
};

interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

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
  /** For tests: the most request bytes in one batch. */
  batchMaxBytes?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mime_type?: string;
}

export class GeminiImageProvider implements ImageProvider, BatchImageProvider {
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

  // ------------------------------------------------------------ Batch Mode (overnight books)

  /** One inlined batch request. Metadata carries what's needed to price the result later. */
  buildBatchRequest(item: BatchItem) {
    const images = referenceImages(item.req);
    const size = this.sizeFor(item.req.targetPx);
    return {
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: buildIllustrationPrompt(item.req) }, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data.toString("base64") } }))],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: nearestAspect(item.req.aspect, GEMINI_ASPECTS), imageSize: size } },
      },
      metadata: { key: item.key, size, refs: String(images.length) },
    };
  }

  private async http(method: "GET" | "POST", path: string, body?: unknown) {
    const res = await this.fetchImpl(`${GEMINI_BASE}/${path}`, {
      method,
      headers: { "x-goog-api-key": this.opts.apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const msg = `Gemini batch request failed (HTTP ${res.status}): ${detail}`;
      if (res.status === 429 || res.status >= 500) throw new Error(msg);
      throw new PermanentProviderError(msg);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async submitIllustrationBatch(items: BatchItem[], label: string): Promise<string[]> {
    // Split so each batch's inlined requests stay under the size limit.
    const max = this.opts.batchMaxBytes ?? GEMINI_BATCH_MAX_BYTES;
    const chunks: Array<Array<ReturnType<GeminiImageProvider["buildBatchRequest"]>>> = [[]];
    let bytes = 0;
    for (const it of items) {
      const r = this.buildBatchRequest(it);
      const n = JSON.stringify(r).length;
      if (n > max) throw new PermanentProviderError(`The picture for ${it.req.label} is too large for an overnight batch`);
      if (bytes + n > max && chunks[chunks.length - 1].length) {
        chunks.push([]);
        bytes = 0;
      }
      chunks[chunks.length - 1].push(r);
      bytes += n;
    }
    const names: string[] = [];
    for (const [i, chunk] of chunks.entries()) {
      const json = await this.http("POST", `models/${encodeURIComponent(this.model)}:batchGenerateContent`, {
        batch: { displayName: `${label}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""}`.slice(0, 120), inputConfig: { requests: { requests: chunk } } },
      });
      const name = typeof json.name === "string" ? json.name : null;
      if (!name) throw new Error("Gemini batch create returned no batch name");
      names.push(name);
    }
    return names;
  }

  async getIllustrationBatch(name: string): Promise<{ state: BatchState; results?: BatchResult[] }> {
    if (!/^batches\/[A-Za-z0-9_-]+$/.test(name)) throw new PermanentProviderError(`Not a batch name: ${name}`);
    const op = (await this.http("GET", name)) as {
      done?: boolean;
      error?: { message?: string };
      metadata?: { state?: string; output?: { inlinedResponses?: { inlinedResponses?: unknown[] } } };
      response?: { inlinedResponses?: { inlinedResponses?: unknown[] } };
    };
    let state: BatchState = BATCH_STATES[op.metadata?.state ?? ""] ?? (op.done ? (op.error ? "failed" : "succeeded") : "running");
    if (state !== "succeeded") return { state };
    const list = (op.response?.inlinedResponses?.inlinedResponses ?? op.metadata?.output?.inlinedResponses?.inlinedResponses ?? []) as Array<{
      response?: { candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }> };
      error?: { message?: string };
      metadata?: { key?: string; size?: string; refs?: string };
    }>;
    if (!list.length) state = "failed";
    const p = this.price();
    const results: BatchResult[] = [];
    for (const r of list) {
      const key = r.metadata?.key;
      if (!key) continue;
      if (r.error) {
        results.push({ key, error: r.error.message ?? "The image service could not draw this picture" });
        continue;
      }
      const parts = r.response?.candidates?.[0]?.content?.parts ?? [];
      let last: { mimeType?: string; data?: string } | null = null;
      for (const part of parts) {
        const d = part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined);
        if (d?.data && !part.thought) last = d;
      }
      if (!last?.data) {
        const why = parts.map((x) => x.text).filter(Boolean).join(" ").slice(0, 200) || r.response?.candidates?.[0]?.finishReason;
        results.push({ key, error: `The image service did not return a picture${why ? `: ${why}` : ""}` });
        continue;
      }
      const data = Buffer.from(last.data, "base64");
      const meta = await sharp(data).metadata();
      const size = (["1K", "2K", "4K"].includes(r.metadata?.size ?? "") ? r.metadata!.size : "2K") as GeminiSize;
      const refs = Number(r.metadata?.refs ?? 0) || 0;
      const usage: Usage = {
        provider: this.name,
        model: this.model,
        imageCalls: 1,
        costUsd: Math.round((p.out[size] + refs * p.perInputImage) * GEMINI_BATCH_DISCOUNT * 1e6) / 1e6,
      };
      const mimeType = meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : "image/jpeg";
      results.push({ key, image: { value: { data, mimeType, width: meta.width ?? 0, height: meta.height ?? 0 }, usage } });
    }
    return { state, results };
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
