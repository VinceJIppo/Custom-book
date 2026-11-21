import { IMAGE_PRICES, PLANNING_IMAGE_PRICE, STORY_TOKEN_BUDGET, VISION_CHECK_USD, tokenCostUsd } from "./prices";

export interface CostLine {
  label: string;
  usd: number;
}

export interface CostEstimate {
  lines: CostLine[];
  totalUsd: number;
  /** What the same book would cost with a real image provider (planning figure). */
  withRealImagesUsd: number;
}

export function estimateBookCost(args: {
  storyPages: number;
  storyProvider: string;
  storyModel: string;
  imageProvider: string;
  upscaler: string;
  vision?: string;
}): CostEstimate {
  const { storyPages } = args;
  const illustrations = storyPages + 1; // + cover
  const lines: CostLine[] = [];

  let storyUsd = 0;
  if (args.storyProvider !== "mock") {
    const b = STORY_TOKEN_BUDGET;
    const call = (c: { base: { input: number; output: number }; perPage: { input: number; output: number } }) =>
      tokenCostUsd(args.storyModel, { inputTokens: c.base.input + c.perPage.input * storyPages, outputTokens: c.base.output + c.perPage.output * storyPages });
    storyUsd =
      tokenCostUsd(args.storyModel, { inputTokens: b.outline.input, outputTokens: b.outline.output }) +
      1.5 * call(b.manuscript) + // first draft, sometimes a second try for long verse lines
      2 * call(b.editor) +
      2 * call(b.patch) + // targeted rewrite and final polish (changed pages only)
      call(b.artDirection);
  }
  lines.push({ label: args.storyProvider === "mock" ? "Story text (mock, free)" : `Story: plan, write, edit, rewrite, polish, art direction (${args.storyModel}, up to 8 calls)`, usd: round(storyUsd) });

  const img = IMAGE_PRICES[args.imageProvider] ?? PLANNING_IMAGE_PRICE;
  lines.push({
    label: `${illustrations} illustrations (${args.imageProvider}${args.imageProvider === "mock" ? ", free" : ""})`,
    usd: round(illustrations * img.perIllustration),
  });
  const up = IMAGE_PRICES[args.upscaler] ?? PLANNING_IMAGE_PRICE;
  lines.push({ label: `${illustrations} upscales for print (${args.upscaler})`, usd: round(illustrations * up.perUpscale) });
  const vision = args.vision ?? "mock";
  if (vision !== "mock" && args.imageProvider !== "mock") {
    // One check per page (likeness and words-vs-picture), plus a redraw and re-check on about a quarter of pages.
    const checks = Math.ceil(illustrations * 1.25);
    lines.push({ label: `Picture checks (${checks}: likeness and words match) and occasional redraws`, usd: round(checks * (VISION_CHECK_USD[vision] ?? 0.02) + Math.ceil(illustrations / 4) * img.perIllustration) });
  }

  const totalUsd = round(lines.reduce((s, l) => s + l.usd, 0));
  const withRealImagesUsd = round(storyUsd + illustrations * (PLANNING_IMAGE_PRICE.perIllustration + PLANNING_IMAGE_PRICE.perUpscale));
  return { lines, totalUsd, withRealImagesUsd };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
