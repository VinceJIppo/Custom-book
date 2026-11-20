import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { StoryContext, StoryProvider } from "../types";
import {
  CharacterBibleSchema,
  OutlineSchema,
  StoryPagesResultSchema,
  validateStoryPages,
  type CharacterBible,
  type Outline,
  type Scene,
  type StoryPagesResult,
} from "../../../schemas/story";
import { PermanentProviderError, sumUsage, type ImageData, type Usage, type WithUsage } from "../../types";
import { tokenCostUsd } from "../../../cost/prices";
import { log } from "../../../log";
import { DESCRIBE_CHARACTER_PROMPT, STORY_SYSTEM_PROMPT, outlinePrompt, pagesPrompt, revisePrompt } from "./prompts";

/*
 * Wire schemas sent to the API as structured-output formats. They carry the
 * shape only; lengths and counts are enforced afterwards with the app schemas
 * in lib/schemas/story.ts, and a failed check triggers a retry with feedback.
 */
const WireScene = z.object({
  action: z.string(),
  characters: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  framing: z.string(),
});
const WireOutline = z.object({
  title: z.string(),
  premise: z.string(),
  pages: z.array(z.object({ pageNumber: z.number().int(), beat: z.string(), summary: z.string(), characters: z.array(z.string()) })),
});
const WirePages = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int(),
      text: z.string(),
      scene: WireScene,
      layout: z.enum(["fullBleed", "imageTop", "spread", "textSpot"]),
      textZone: z.enum(["top", "bottom", "left", "right"]),
    }),
  ),
  dedication: z.string(),
  backCoverBlurb: z.string(),
  coverScene: WireScene,
});
const WireRevision = z.object({ text: z.string() });
const WireBible = z.object({
  hair: z.string(),
  eyes: z.string(),
  skinTone: z.string(),
  faceShape: z.string(),
  glasses: z.string(),
  freckles: z.string(),
  signatureOutfit: z.string(),
  otherDetails: z.string(),
});

type UserContent = Anthropic.Beta.Messages.BetaContentBlockParam[] | string;

export interface ModelCallResult {
  text: string;
  stopReason: string | null;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}

/** The single function that talks to the API. Injected in tests. */
export type ModelCaller = (args: { content: UserContent; format: ReturnType<typeof betaZodOutputFormat>; maxTokens: number }) => Promise<ModelCallResult>;

export interface AnthropicStoryOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  fallbacks: boolean;
  apiKey?: string;
  maxAttempts?: number;
  caller?: ModelCaller;
}

export class AnthropicStoryProvider implements StoryProvider {
  readonly name = "anthropic";
  private readonly call: ModelCaller;
  private readonly maxAttempts: number;

  constructor(private readonly opts: AnthropicStoryOptions) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.call = opts.caller ?? this.defaultCaller();
  }

  private defaultCaller(): ModelCaller {
    const client = new Anthropic({ apiKey: this.opts.apiKey, maxRetries: 2 });
    return async ({ content, format, maxTokens }) => {
      // Streaming avoids HTTP timeouts on long outputs. Server-side fallbacks
      // re-run a refused request on a fallback model inside the same call.
      const stream = client.beta.messages.stream({
        model: this.opts.model,
        max_tokens: maxTokens,
        system: STORY_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output_config: { format, effort: this.opts.effort },
        ...(this.opts.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const msg = await stream.finalMessage();
      const text = msg.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, stopReason: msg.stop_reason, model: msg.model, usage: msg.usage };
    };
  }

  private toUsage(r: ModelCallResult): Usage {
    const u = {
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
    };
    return { provider: this.name, model: r.model, ...u, costUsd: tokenCostUsd(r.model || this.opts.model, u) };
  }

  /**
   * Calls the model, parses JSON, validates with `schema` and `extraCheck`, and
   * retries with the list of problems when the output is not usable.
   */
  private async generate<T>(opts: {
    label: string;
    build: (problems?: string[]) => UserContent;
    wire: z.ZodType;
    schema: z.ZodType<T>;
    extraCheck?: (v: T) => string[];
    maxTokens: number;
  }): Promise<WithUsage<T>> {
    const usages: Usage[] = [];
    let problems: string[] | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const res = await this.call({ content: opts.build(problems), format: betaZodOutputFormat(opts.wire), maxTokens: opts.maxTokens });
      usages.push(this.toUsage(res));
      if (res.stopReason === "refusal") {
        throw new PermanentProviderError(
          "The story service declined this request. Try a different theme or remove unusual instructions.",
        );
      }
      if (res.stopReason === "max_tokens") {
        problems = ["The answer was cut off. Keep every field concise."];
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(res.text);
      } catch {
        problems = ["The answer was not valid JSON."];
        log.warn(`${opts.label}: invalid JSON`, { attempt });
        continue;
      }
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        problems = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        log.warn(`${opts.label}: schema problems`, { attempt, problems });
        continue;
      }
      const extra = opts.extraCheck?.(parsed.data) ?? [];
      if (extra.length) {
        problems = extra;
        log.warn(`${opts.label}: content problems`, { attempt, problems });
        continue;
      }
      return { value: parsed.data, usage: sumUsage(this.name, usages) };
    }
    const err = new Error(`${opts.label} failed after ${this.maxAttempts} attempts: ${(problems ?? []).join("; ")}`);
    (err as Error & { usage?: Usage }).usage = sumUsage(this.name, usages);
    throw err;
  }

  generateOutline(ctx: StoryContext): Promise<WithUsage<Outline>> {
    const n = ctx.options.length;
    return this.generate({
      label: "outline",
      build: (p) => outlinePrompt(ctx, p),
      wire: WireOutline,
      schema: OutlineSchema,
      extraCheck: (o) => (o.pages.length === n ? [] : [`The outline must have exactly ${n} pages (it had ${o.pages.length}).`]),
      maxTokens: 24000,
    });
  }

  generatePages(outline: Outline, ctx: StoryContext): Promise<WithUsage<StoryPagesResult>> {
    return this.generate({
      label: "pages",
      build: (p) => pagesPrompt(ctx, outline, p),
      wire: WirePages,
      schema: StoryPagesResultSchema,
      extraCheck: (r) => validateStoryPages(r.pages, ctx.options.length),
      maxTokens: 48000,
    });
  }

  reviseText(page: { text: string; scene: Scene | null }, instruction: string, ctx: StoryContext): Promise<WithUsage<{ text: string }>> {
    return this.generate({
      label: "revise",
      build: () => revisePrompt(page.text, page.scene?.action ?? null, instruction, ctx),
      wire: WireRevision,
      schema: z.object({ text: z.string().min(1).max(900) }),
      maxTokens: 8000,
    });
  }

  describeCharacter(sheet: ImageData): Promise<WithUsage<CharacterBible>> {
    const mediaType = sheet.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    return this.generate({
      label: "describeCharacter",
      build: () => [
        { type: "image", source: { type: "base64", media_type: mediaType, data: sheet.data.toString("base64") } },
        { type: "text", text: DESCRIBE_CHARACTER_PROMPT },
      ],
      wire: WireBible,
      schema: CharacterBibleSchema,
      maxTokens: 8000,
    });
  }
}
