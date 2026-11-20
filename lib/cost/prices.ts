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
 * thinking). Output scales with story length for the pages call.
 */
export const STORY_TOKEN_BUDGET = {
  outline: { input: 2_500, output: 6_000 },
  pagesPerStoryPage: { input: 300, output: 900 },
  pagesBase: { input: 3_000, output: 4_000 },
  revise: { input: 1_000, output: 1_500 },
};

/** Per-image high-side prices. Real image providers are added in Phase 2. */
export const IMAGE_PRICES: Record<string, { perIllustration: number; perUpscale: number }> = {
  mock: { perIllustration: 0, perUpscale: 0 },
};
/** Planning figure for a real image provider until one is chosen in Phase 2. */
export const PLANNING_IMAGE_PRICE = { perIllustration: 0.08, perUpscale: 0.02 };
