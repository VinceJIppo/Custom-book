import { describe, expect, it } from "vitest";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { AnthropicStoryProvider } from "@/lib/providers/anthropic/story";
import { jsonFormat, type ModelCallResult, type ModelCaller } from "@/lib/providers/anthropic/client";
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

/** A mock outline with the story spine filled in, as a real model must return it. */
async function spineOutline(ctx: Parameters<MockStoryProvider["generateOutline"]>[0]) {
  const good = (await new MockStoryProvider().generateOutline(ctx)).value;
  return {
    ...good,
    worldRule: "The bell only rings when everyone laughs together.",
    problem: "The bell went quiet and nobody knows why.",
    goal: "Make the whole town laugh at once.",
    attempts: [{ attempt: "The Mayor orders everyone to laugh.", whyItFails: "Laughs on command are not real." }],
    turningPoint: "Teddy notices the grump is hungry.",
    resolution: "A shared snack and a silly game make everyone laugh. DING!",
    lessonShown: "Teddy shares first.",
    setups: [{ item: "the cheese in Teddy's pocket", setUpOnPage: 2, paysOffOnPage: 9 }],
    continuity: [{ fact: "the town is upside down", fromPage: 1, toPage: 12 }],
    endingEcho: "The bell rings again at bedtime.",
    pages: good.pages.map((pg) => ({ ...pg, causeFromPrevious: pg.pageNumber > 1 ? "because of the page before" : "" })),
  };
}

describe("AnthropicStoryProvider (no network)", () => {
  const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, length: 12 as const } };
  const provider = (caller: ModelCaller) => new AnthropicStoryProvider({ model: "claude-sonnet-5-5", effort: "high", fallbacks: true, caller });
  const manuscript = (tag: string) => ({ pages: Array.from({ length: 12 }, (_, i) => ({ pageNumber: i + 1, text: `${tag} page ${i + 1}.` })), dedication: "For Teddy.", backCoverBlurb: "A giggly tale about a quiet bell." });
  async function art() {
    const mock = new MockStoryProvider();
    const pages = (await mock.generatePages((await mock.generateOutline(ctx)).value, ctx)).value;
    return {
      pages: pages.pages.map((p) => ({ pageNumber: p.pageNumber, scene: p.scene, layout: p.layout, textZone: p.textZone })),
      storySummary: "Teddy helps an upside-down town make its quiet bell ring again by getting everyone to laugh together.",
      coverScene: pages.coverScene,
    };
  }

  it("retries invalid JSON and wrong page counts, feeding problems back, and sums cost", async () => {
    const good = await spineOutline(ctx);
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

  it("rejects an outline without a story spine and says what is missing", async () => {
    const good = await spineOutline(ctx);
    const noSpine = { ...good, worldRule: "", attempts: [], setups: [{ item: "a ladder", setUpOnPage: 10, paysOffOnPage: 3 }], pages: good.pages.map((pg) => ({ ...pg, causeFromPrevious: "" })) };
    const { caller, prompts } = scripted([reply(noSpine), reply(good)]);
    const res = await provider(caller).generateOutline(ctx);
    expect(res.value.worldRule).toMatch(/laughs together/);
    expect(prompts[1]).toMatch(/worldRule, problem and goal/);
    expect(prompts[1]).toMatch(/at least one attempt/);
    expect(prompts[1]).toMatch(/causeFromPrevious for pages 2, 3/);
    expect(prompts[1]).toMatch(/Set these up before they pay off: a ladder/);
  });

  it("writes the whole manuscript, has it edited, then directs the art for the final words", async () => {
    const outline = await spineOutline(ctx);
    const { caller, prompts } = scripted([reply(manuscript("Draft")), reply({ verdict: "pass", overall: "Clear and funny.", issues: [] }), reply(await art())]);
    const res = await provider(caller).generatePages(outline, ctx);
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain("Draft page 4."); // the editor reads the draft
    expect(prompts[2]).toContain("Draft page 4."); // art direction reads the final words
    expect(res.value.pages).toHaveLength(12);
    expect(res.value.pages[3].text).toBe("Draft page 4.");
    expect(res.value.storySummary).toMatch(/upside-down town/);
    expect(res.value.editorNotes).toHaveLength(1);
    expect(res.value.pages.every((p) => p.scene.mustShow.length > 0)).toBe(true);
  });

  it("rewrites once when the editor finds problems, passing the specific fixes", async () => {
    const outline = await spineOutline(ctx);
    const issue = { page: 8, problem: "Why doesn't pulling the rope ring the bell?", fix: "Say earlier that the bell ignores pulling and shouting." };
    const { caller, prompts } = scripted([
      reply(manuscript("Draft")),
      reply({ verdict: "revise", overall: "The rule is never stated.", issues: [issue] }),
      reply(manuscript("Fixed")),
      reply({ verdict: "revise", overall: "Still one nit.", issues: [{ page: 2, problem: "nit", fix: "nit" }] }),
      reply(await art()),
    ]);
    const res = await provider(caller).generatePages(outline, ctx);
    expect(prompts).toHaveLength(5); // at most one rewrite, even if the second review still has notes
    expect(prompts[2]).toContain("Why doesn't pulling the rope ring the bell?");
    expect(prompts[4]).toContain("Fixed page 8.");
    expect(res.value.pages[7].text).toBe("Fixed page 8.");
    expect(res.value.editorNotes.map((n) => n.verdict)).toEqual(["revise", "revise"]);
    // 5 calls x $0.022
    expect(res.usage.costUsd).toBeCloseTo(0.11, 6);
  });

  it("asks art direction again when a page has no must-show details", async () => {
    const outline = await spineOutline(ctx);
    const a = await art();
    const missing = { ...a, pages: a.pages.map((p, i) => (i === 2 ? { ...p, scene: { ...p.scene, mustShow: [] } } : p)) };
    const { caller, prompts } = scripted([reply(manuscript("Draft")), reply({ verdict: "pass", overall: "ok", issues: [] }), reply(missing), reply(a)]);
    await provider(caller).generatePages(outline, ctx);
    expect(prompts[3]).toMatch(/List mustShow details for pages 3/);
  });

  it("retries a cut-off answer (max tokens) with feedback instead of crashing", async () => {
    const good = await spineOutline(ctx);
    const cut = JSON.stringify(good).slice(0, 500);
    const { caller, prompts } = scripted([reply(cut, { stopReason: "max_tokens" }), reply(good)]);
    const res = await provider(caller).generateOutline(ctx);
    expect(res.value.pages).toHaveLength(12);
    expect(prompts[1]).toMatch(/cut off because it was too long/);
  });

  it("sends the JSON schema without the SDK's own parser, so our retry loop sees cut-offs", () => {
    const f = jsonFormat(OutlineSchema);
    expect(f.type).toBe("json_schema");
    expect(f.schema).toBeTypeOf("object");
    expect("parse" in f).toBe(false);
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
    const good = await spineOutline(ctx);
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
