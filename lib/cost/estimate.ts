import { IMAGE_PRICES, PLANNING_IMAGE_PRICE, STORY_TOKEN_BUDGET, tokenCostUsd } from "./prices";

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
}): CostEstimate {
  const { storyPages } = args;
  const illustrations = storyPages + 1; // + cover
  const lines: CostLine[] = [];

  let storyUsd = 0;
  if (args.storyProvider !== "mock") {
    const b = STORY_TOKEN_BUDGET;
    storyUsd =
      tokenCostUsd(args.storyModel, { inputTokens: b.outline.input, outputTokens: b.outline.output }) +
      tokenCostUsd(args.storyModel, {
        inputTokens: b.pagesBase.input + b.pagesPerStoryPage.input * storyPages,
        outputTokens: b.pagesBase.output + b.pagesPerStoryPage.output * storyPages,
      });
  }
  lines.push({ label: args.storyProvider === "mock" ? "Story text (mock, free)" : `Story text (${args.storyModel}, 2 calls)`, usd: round(storyUsd) });

  const img = IMAGE_PRICES[args.imageProvider] ?? PLANNING_IMAGE_PRICE;
  lines.push({
    label: `${illustrations} illustrations (${args.imageProvider}${args.imageProvider === "mock" ? ", free" : ""})`,
    usd: round(illustrations * img.perIllustration),
  });
  const up = IMAGE_PRICES[args.upscaler] ?? PLANNING_IMAGE_PRICE;
  lines.push({ label: `${illustrations} upscales for print (${args.upscaler})`, usd: round(illustrations * up.perUpscale) });

  const totalUsd = round(lines.reduce((s, l) => s + l.usd, 0));
  const withRealImagesUsd = round(storyUsd + illustrations * (PLANNING_IMAGE_PRICE.perIllustration + PLANNING_IMAGE_PRICE.perUpscale));
  return { lines, totalUsd, withRealImagesUsd };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
