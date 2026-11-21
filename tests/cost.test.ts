import { describe, expect, it } from "vitest";
import { estimateBookCost } from "@/lib/cost/estimate";
import { tokenCostUsd } from "@/lib/cost/prices";

describe("cost", () => {
  it("prices tokens per million", () => {
    expect(tokenCostUsd("claude-sonnet-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(12);
    // Unknown models are priced high, never free.
    expect(tokenCostUsd("some-new-model", { inputTokens: 1_000_000 })).toBeGreaterThanOrEqual(4);
  });
  it("mock everything costs nothing", () => {
    expect(estimateBookCost({ storyPages: 16, storyProvider: "mock", storyModel: "mock", imageProvider: "mock", upscaler: "mock" }).totalUsd).toBe(0);
  });
  it("a 16-page Claude story is estimated high-side at well under a dollar", () => {
    const e = estimateBookCost({ storyPages: 16, storyProvider: "anthropic", storyModel: "claude-sonnet-5-5", imageProvider: "mock", upscaler: "mock" });
    expect(e.totalUsd).toBeGreaterThan(0.1);
    expect(e.totalUsd).toBeLessThan(1); // plan, draft, review, rewrite, review, polish, art direction
    expect(e.withRealImagesUsd).toBeGreaterThan(e.totalUsd);
  });
});
