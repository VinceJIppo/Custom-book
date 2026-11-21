import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { PermanentProviderError, sumUsage, type ImageData, type Usage, type WithUsage } from "../types";
import { tokenCostUsd } from "../../cost/prices";
import { log } from "../../log";

/**
 * Shared Claude caller for every Anthropic-backed feature: one request shape,
 * structured JSON output, Zod validation, and retry-with-feedback.
 * This folder is the only place allowed to import the Anthropic SDK.
 */

export type UserContent = Anthropic.Beta.Messages.BetaContentBlockParam[] | string;

export interface ModelCallResult {
  text: string;
  stopReason: string | null;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}

/** The single function that talks to the API. Injected in tests. */
export type ModelCaller = (args: {
  system: string;
  content: UserContent;
  format: JsonFormat;
  maxTokens: number;
}) => Promise<ModelCallResult>;

export interface JsonFormat {
  type: "json_schema";
  schema: Record<string, unknown>;
}

/**
 * The JSON schema to send, WITHOUT the SDK's built-in parser: with it, the SDK
 * throws on a cut-off or malformed answer before our retry-with-feedback loop
 * can see the stop reason and try again.
 */
export function jsonFormat(wire: z.ZodType): JsonFormat {
  const { type, schema } = betaZodOutputFormat(wire as Parameters<typeof betaZodOutputFormat>[0]);
  return { type, schema };
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeOptions {
  model: string;
  effort: Effort;
  fallbacks: boolean;
  apiKey?: string;
  maxAttempts?: number;
  caller?: ModelCaller;
}

export function realCaller(opts: ClaudeOptions): ModelCaller {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 });
  return async ({ system, content, format, maxTokens }) => {
    // Streaming avoids HTTP timeouts on long outputs. Server-side fallbacks
    // re-run a refused request on a fallback model inside the same call.
    const stream = client.beta.messages.stream({
      model: opts.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      output_config: { format, effort: opts.effort },
      ...(opts.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    const msg = await stream.finalMessage();
    const text = msg.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, stopReason: msg.stop_reason, model: msg.model, usage: msg.usage };
  };
}

export function imageBlock(img: ImageData): Anthropic.Beta.Messages.BetaContentBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: img.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: img.data.toString("base64") },
  };
}

export class ClaudeJson {
  readonly name = "anthropic";
  private readonly call: ModelCaller;
  private readonly maxAttempts: number;

  constructor(private readonly opts: ClaudeOptions) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.call = opts.caller ?? realCaller(opts);
  }

  get model() {
    return this.opts.model;
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
  async generate<T>(opts: {
    label: string;
    system: string;
    build: (problems?: string[]) => UserContent;
    wire: z.ZodType;
    schema: z.ZodType<T>;
    extraCheck?: (v: T) => string[];
    maxTokens: number;
  }): Promise<WithUsage<T>> {
    const usages: Usage[] = [];
    let problems: string[] | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const res = await this.call({ system: opts.system, content: opts.build(problems), format: jsonFormat(opts.wire), maxTokens: opts.maxTokens });
      usages.push(this.toUsage(res));
      if (res.stopReason === "refusal") {
        const err = new PermanentProviderError("The AI service declined this request. Try different wording or a different theme.");
        (err as Error & { usage?: Usage }).usage = sumUsage(this.name, usages);
        throw err;
      }
      if (res.stopReason === "max_tokens") {
        problems = ["The answer was cut off because it was too long. Keep every field concise and think less before answering."];
        log.warn(`${opts.label}: cut off at max tokens`, { attempt });
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
}

export function retryNote(problems?: string[]) {
  if (!problems?.length) return "";
  return `\nYour previous answer had these problems. Fix all of them:\n- ${problems.join("\n- ")}`;
}
