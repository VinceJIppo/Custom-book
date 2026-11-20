import { describe, expect, it } from "vitest";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { AnthropicStoryProvider, type ModelCallResult, type ModelCaller } from "@/lib/providers/story/anthropic";
import { OutlineSchema, StoryPagesResultSchema, validateStoryPages } from "@/lib/schemas/story";
import { PermanentProviderError } from "@/lib/providers/types";
import { loadBuiltInThemeFiles } from "@/lib/themes";
import { STORY_LENGTHS, READING_LEVELS } from "@/lib/schemas/book";
import { sampleChild, sampleOptions, superhero } from "./helpers";

describe("MockStoryProvider", () => {
  const p = new MockStoryProvider();
  for (const theme of loadBuiltInThemeFiles()) {
    for (const length of STORY_LENGTHS) {
      it(`${theme.id} x ${length} pages produces a valid book`, async () => {
        const ctx = { child: sampleChild, theme, options: { ...sampleOptions, length } };
        const outline = (await p.generateOutline(ctx)).value;
        expect(OutlineSchema.parse(outline).pages).toHaveLength(length);
        const res = (await p.generatePages(outline, ctx)).value;
        StoryPagesResultSchema.parse(res);
        expect(validateStoryPages(res.pages, length)).toEqual([]);
        expect(res.pages.every((pg) => !/\{\w+\}/.test(pg.text))).toBe(true);
      });
    }
  }

  it("respects reading level sentence counts", async () => {
    for (const readingLevel of READING_LEVELS) {
      const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, readingLevel } };
      const res = (await p.generatePages((await p.generateOutline(ctx)).value, ctx)).value;
      const maxSentences = Math.max(...res.pages.map((pg) => pg.text.split(/(?<=[.!?]["”]?)\s+/).length));
      if (readingLevel === "2-4") expect(maxSentences).toBeLessThanOrEqual(3);
      if (readingLevel === "6-8") expect(maxSentences).toBeGreaterThanOrEqual(3);
    }
  });

  it("only includes the pet when asked", async () => {
    const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, includePet: false, includeFriend: false } };
    const res = (await p.generatePages((await p.generateOutline(ctx)).value, ctx)).value;
    expect(res.pages.some((pg) => pg.text.includes("Biscuit"))).toBe(false);
    const ctx2 = { ...ctx, options: { ...ctx.options, includePet: true } };
    const res2 = (await p.generatePages((await p.generateOutline(ctx2)).value, ctx2)).value;
    expect(res2.pages.some((pg) => pg.text.includes("Biscuit"))).toBe(true);
  });
});

function reply(obj: unknown, extra: Partial<ModelCallResult> = {}): ModelCallResult {
  return {
    text: typeof obj === "string" ? obj : JSON.stringify(obj),
    stopReason: "end_turn",
    model: "claude-sonnet-5-5",
    usage: { input_tokens: 1000, output_tokens: 2000 },
    ...extra,
  };
}

function scripted(replies: ModelCallResult[]) {
  const prompts: string[] = [];
  const caller: ModelCaller = async ({ content }) => {
    prompts.push(typeof content === "string" ? content : JSON.stringify(content));
    const r = replies.shift();
    if (!r) throw new Error("no more scripted replies");
    return r;
  };
  return { caller, prompts };
}

describe("AnthropicStoryProvider (no network)", () => {
  const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, length: 12 as const } };

  it("retries invalid JSON and wrong page counts, feeding problems back, and sums cost", async () => {
    const good = (await new MockStoryProvider().generateOutline(ctx)).value;
    const { caller, prompts } = scripted([reply("not json {"), reply({ ...good, pages: good.pages.slice(0, 5) }), reply(good)]);
    const p = new AnthropicStoryProvider({ model: "claude-sonnet-5-5", effort: "high", fallbacks: true, caller });
    const res = await p.generateOutline(ctx);
    expect(res.value.pages).toHaveLength(12);
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toMatch(/not valid JSON/);
    expect(prompts[2]).toMatch(/exactly 12 pages/);
    // 3 calls x (1000 in @ $2/M + 2000 out @ $10/M) = 3 x 0.022
    expect(res.usage.costUsd).toBeCloseTo(0.066, 6);
    expect(res.usage.attempts).toBe(3);
  });

  it("validates pages against the requested length", async () => {
    const mock = new MockStoryProvider();
    const outline = (await mock.generateOutline(ctx)).value;
    const pages = (await mock.generatePages(outline, ctx)).value;
    const { caller } = scripted([reply(pages)]);
    const res = await new AnthropicStoryProvider({ model: "claude-sonnet-5-5", effort: "high", fallbacks: true, caller }).generatePages(outline, ctx);
    expect(res.value.pages).toHaveLength(12);
  });

  it("treats a refusal as permanent (no pointless retries)", async () => {
    const { caller, prompts } = scripted([reply("", { stopReason: "refusal" })]);
    const p = new AnthropicStoryProvider({ model: "claude-sonnet-5-5", effort: "high", fallbacks: true, caller });
    await expect(p.generateOutline(ctx)).rejects.toBeInstanceOf(PermanentProviderError);
    expect(prompts).toHaveLength(1);
  });

  it("gives up after max attempts and reports the spend", async () => {
    const { caller } = scripted([reply("x"), reply("y"), reply("z")]);
    const p = new AnthropicStoryProvider({ model: "claude-sonnet-5-5", effort: "high", fallbacks: true, caller });
    const err = await p.generateOutline(ctx).catch((e) => e);
    expect(err.message).toMatch(/failed after 3 attempts/);
    expect(err.usage.costUsd).toBeGreaterThan(0);
  });

  it("puts the child and theme in the prompt but never raw instructions outside the JSON payload", async () => {
    const good = (await new MockStoryProvider().generateOutline(ctx)).value;
    const { caller, prompts } = scripted([reply(good)]);
    await new AnthropicStoryProvider({ model: "m", effort: "high", fallbacks: false, caller }).generateOutline({
      ...ctx,
      options: { ...ctx.options, instructions: "Make it rhyme" },
    });
    expect(prompts[0]).toContain('"name": "Theodore"');
    expect(prompts[0]).toContain('"extraInstructionsFromParent": "Make it rhyme"');
    expect(prompts[0]).toContain("Sparkport");
  });
});
