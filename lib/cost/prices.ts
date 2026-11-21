/**
 * Conservative (high-side) prices used for cost tracking and estimates.
 * Verify against each provider's pricing page before relying on these numbers.
 * Token prices are USD per million tokens. Claude prices checked 2026-11-20.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};
/** Used when a model is missing from the table: priced like the most expensive listed model. */
const UNKNOWN_MODEL = { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 };

export function tokenCostUsd(
  model: string,
  u: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number },
): number {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES[model.replace(/-\d{8}$/, "")] ?? UNKNOWN_MODEL;
  const cost =
    ((u.inputTokens ?? 0) * p.input +
      (u.outputTokens ?? 0) * p.output +
      (u.cacheReadTokens ?? 0) * p.cacheRead +
      (u.cacheWriteTokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * High-side token budgets per story call (input, output including the model's
 * thinking). A book is: outline (story spine), manuscript, editor review, a
 * targeted rewrite (changed pages only), a second review, a final polish, and
 * art direction. The estimate assumes the rewrite and polish both happen, and
 * one extra manuscript try for over-long verse lines. Calibrated against real
 * 12-page runs, which cost about $0.80 to $0.90 (thinking makes up much of the output).
 */
export const STORY_TOKEN_BUDGET = {
  outline: { input: 2_500, output: 10_000 },
  manuscript: { base: { input: 4_000, output: 6_000 }, perPage: { input: 300, output: 700 } },
  editor: { base: { input: 4_000, output: 6_000 }, perPage: { input: 150, output: 0 } },
  patch: { base: { input: 6_000, output: 5_000 }, perPage: { input: 350, output: 150 } },
  artDirection: { base: { input: 5_000, output: 8_000 }, perPage: { input: 300, output: 600 } },
  revise: { input: 1_000, output: 1_500 },
};

/**
 * Per-image high-side prices used for estimates (actual cost is recorded from
 * each response). Gemini: Nano Banana 2.1 is $0.0504 at 2K and $0.113 at 4K;
 * the estimate assumes 4K for every page. OpenAI: token-priced; this is a
 * planning figure for high quality near 4K. Upscaling is local (free).
 */
export const IMAGE_PRICES: Record<string, { perIllustration: number; perUpscale: number; perSheetOption: number }> = {
  mock: { perIllustration: 0, perUpscale: 0, perSheetOption: 0 },
  gemini: { perIllustration: 0.115, perUpscale: 0, perSheetOption: 0.06 },
  openai: { perIllustration: 0.3, perUpscale: 0, perSheetOption: 0.25 },
};
/** Planning figure when the image provider is not configured yet. */
export const PLANNING_IMAGE_PRICE = { perIllustration: 0.115, perUpscale: 0, perSheetOption: 0.06 };

/** High-side cost of one vision check (page check: likeness plus words-vs-picture; or photo check). */
export const VISION_CHECK_USD: Record<string, number> = { mock: 0, anthropic: 0.02 };
