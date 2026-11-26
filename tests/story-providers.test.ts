import { z } from "zod";
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
    kidSummary: ["Teddy loves the town bell.", "But the bell stops, because nobody laughs together.", "The Mayor orders a laugh, but that does not work.", "Teddy shares his cheese with the grump.", "So everyone laughs and the bell rings."],
    setups: [{ item: "the cheese in Teddy's pocket", setUpOnPage: 2, paysOffOnPage: 9 }],
    continuity: [{ fact: "the town is upside down", fromPage: 1, toPage: 12 }],
    endingEcho: "The bell rings again at bedtime.",
    pages: good.pages.map((pg) => ({ ...pg, causeFromPrevious: pg.pageNumber > 1 ? "because of the page before" : "" })),
  };
}

describe("AnthropicStoryProvider (no network)", () => {
  // A prose voice: these tests follow the writing and checking steps (rhyming books get their own test).
  const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, length: 12 as const, voice: "classic" as const } };
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

  const blind = (confusing: Array<{ page: number; question: string }> = []) =>
    reply({ whatTheHeroWanted: "To make the bell ring.", whatWentWrong: "The bell went quiet.", whyItWentWrong: "Nobody laughed together.", tries: [{ what: "The Mayor ordered a laugh.", whyItFailed: "Laughs on command aren't real." }], howItWasSolved: "Teddy shared his cheese and everyone laughed.", howItEnded: "The bell rang at bedtime.", confusing });
  const pass = () => reply({ verdict: "pass", overall: "Clear and funny.", retellingMatch: 1, issues: [] });

  it("writes the manuscript, has it read blind, edited against that retelling, then directs the art", async () => {
    const outline = await spineOutline(ctx);
    const { caller, prompts } = scripted([reply(manuscript("Draft")), blind(), pass(), reply(await art())]);
    const res = await provider(caller).generatePages(outline, ctx);
    expect(prompts).toHaveLength(4);
    // The blind reader hears only the words: never the plan.
    expect(prompts[1]).toContain("Draft page 4.");
    expect(prompts[1]).not.toContain("kidSummary");
    expect(prompts[1]).not.toContain("laughs together");
    // The editor compares the plan with what the listener understood.
    expect(prompts[2]).toContain("Wanted: To make the bell ring.");
    expect(prompts[2]).toContain("kidSummary");
    expect(prompts[3]).toContain("Draft page 4."); // art direction reads the final words
    expect(res.value.pages[3].text).toBe("Draft page 4.");
    expect(res.value.editorNotes).toHaveLength(1);
    expect(res.value.editorNotes[0]).toMatchObject({ retellingMatch: 1, round: "draft" });
    expect(res.value.editorNotes[0].retelling).toMatch(/Confusing: nothing/);
    expect(res.value.pages.every((p) => p.scene.mustShow.length > 0)).toBe(true);
  });

  it("serious problems: the whole story is rewritten, read blind and edited again, then polished", async () => {
    const outline = await spineOutline(ctx);
    const issue = { page: 8, problem: "Why doesn't pulling the rope ring the bell?", fix: "Say earlier that the bell ignores pulling and shouting.", severity: "major" };
    const { caller, prompts } = scripted([
      reply(manuscript("Draft")),
      blind([{ page: 8, question: "Why not just pull the rope?" }]),
      reply({ verdict: "revise", overall: "The rule is never stated.", retellingMatch: 0.6, issues: [issue] }),
      reply({ ...manuscript("Fixed"), dedication: "", backCoverBlurb: "" }),
      blind(),
      reply({ verdict: "revise", overall: "One slip left.", retellingMatch: 0.95, issues: [{ page: 12, problem: "A clunky last line.", fix: "Smooth it.", severity: "minor" }] }),
      reply({ pages: [{ pageNumber: 12, text: "A sleepy giggle, and a soft ding." }], dedication: "", backCoverBlurb: "" }),
      reply(await art()),
    ]);
    const res = await provider(caller).generatePages(outline, ctx);
    expect(prompts).toHaveLength(8);
    expect(prompts[2]).toContain("Why not just pull the rope?");
    expect(prompts[3]).toMatch(/Write the whole story again/);
    expect(prompts[3]).toContain("Why doesn't pulling the rope ring the bell?");
    expect(prompts[4]).toContain("Fixed page 4."); // the rewrite is read blind again
    expect(prompts[6]).toMatch(/final polish/);
    const text = res.value.pages.map((p) => p.text);
    expect(text[3]).toBe("Fixed page 4.");
    expect(text[11]).toBe("A sleepy giggle, and a soft ding.");
    expect(res.value.backCoverBlurb).toBe("A giggly tale about a quiet bell."); // empty means keep
    expect(res.value.editorNotes.map((n) => [n.round, n.retellingMatch])).toEqual([["draft", 0.6], ["rewrite", 0.95]]);
    expect(res.usage.costUsd).toBeCloseTo(0.176, 6); // 8 calls x $0.022
  });

  it("only wording notes: a light polish and no second round; checks think at medium effort", async () => {
    const outline = await spineOutline(ctx);
    const efforts: Array<string | undefined> = [];
    const replies = [
      reply(manuscript("Draft")),
      blind(),
      reply({ verdict: "revise", overall: "Lovely; one wording note.", retellingMatch: 1, issues: [{ page: 3, problem: "A clunky line.", fix: "Smooth it.", severity: "minor" }] }),
      reply({ pages: [{ pageNumber: 3, text: "A smoother line." }], dedication: "", backCoverBlurb: "" }),
    ];
    const caller: ModelCaller = async ({ effort }) => {
      efforts.push(effort);
      return replies.shift()!;
    };
    const saved: string[] = [];
    const stages: string[] = [];
    const res = await provider(caller).writeManuscript(outline, ctx, { save: async (cp) => void saved.push(cp.stage), onStage: async (s) => void stages.push(s) });
    expect(efforts).toEqual([undefined, "medium", "medium", "medium"]); // write, blind read, edit, polish
    expect(res.value.pages[2].text).toBe("A smoother line.");
    expect(saved).toEqual(["written", "polished", "done"]);
    expect(stages).toEqual(["writing", "editing"]);
  });

  it("serious problems use full thinking for the rewrite and medium for the checks", async () => {
    const outline = await spineOutline(ctx);
    const efforts: Array<string | undefined> = [];
    const replies = [
      reply(manuscript("Draft")),
      blind(),
      reply({ verdict: "revise", overall: "A plot hole.", retellingMatch: 0.5, issues: [{ page: 8, problem: "The rule is never stated.", fix: "State it on page 2.", severity: "major" }] }),
      reply(manuscript("Fixed")),
      blind(),
      pass(),
    ];
    const caller: ModelCaller = async ({ effort }) => {
      efforts.push(effort);
      return replies.shift()!;
    };
    const saved: string[] = [];
    const res = await provider(caller).writeManuscript(outline, ctx, { save: async (cp) => void saved.push(cp.stage) });
    expect(efforts).toEqual([undefined, "medium", "medium", undefined, "medium", "medium"]);
    expect(saved).toEqual(["written", "rewritten", "polished", "done"]);
    expect(res.value.pages[0].text).toBe("Fixed page 1.");
    expect(res.value.editorNotes).toHaveLength(2);
  });

  it("a retry picks up from the saved draft instead of writing again", async () => {
    const outline = await spineOutline(ctx);
    const { caller, prompts } = scripted([blind(), pass()]);
    const draft = { stage: "written" as const, ...manuscript("Saved"), editorNotes: [] };
    const res = await provider(caller).writeManuscript(outline, ctx, { resume: draft });
    expect(prompts).toHaveLength(2); // blind read and editor; no new manuscript
    expect(prompts[0]).toContain("Saved page 4.");
    expect(res.value.pages[3].text).toBe("Saved page 4.");
  });

  it("a chosen story idea is the spine of the plan, with full thinking", async () => {
    const theme = { ...superhero(), starters: [{ id: "first-power", title: "The Power Nobody Saw", idea: "The child helps a crying kid first, and that kindness is their power." }] };
    const c2 = { ...ctx, theme, options: { ...ctx.options, starterId: "first-power" } };
    const good = await spineOutline(c2);
    const efforts: Array<string | undefined> = [];
    const prompts: string[] = [];
    const caller: ModelCaller = async ({ content, effort }) => {
      efforts.push(effort);
      prompts.push(String(content));
      return reply(good);
    };
    await provider(caller).generateOutline(c2);
    expect(prompts[0]).toContain('Story idea "The Power Nobody Saw"');
    expect(prompts[0]).toMatch(/STORY BUDGET for 12 pages/);
    expect(efforts).toEqual([undefined]);
  });

  it("removes long dashes from the printed words", async () => {
    const outline = await spineOutline(ctx);
    const m = manuscript("Draft");
    m.pages[0].text = "Zizzle bounced in—polka-dot paws—and sang.";
    m.pages[1].text = "'A sock sneezed ah-ah-ah—?' 'CHOO!'";
    const { caller } = scripted([reply({ ...m, dedication: "For Teddy—always." }), blind(), pass(), reply(await art())]);
    const res = await provider(caller).generatePages(outline, ctx);
    expect(res.value.pages[0].text).toBe("Zizzle bounced in, polka-dot paws, and sang.");
    expect(res.value.pages[1].text).toBe("'A sock sneezed ah-ah-ah...?' 'CHOO!'");
    expect(res.value.dedication).toBe("For Teddy, always.");
    expect(JSON.stringify(res.value)).not.toMatch(/[—–]/);
  });

  it("rhyming books: written and checked in prose, then put into verse, which is read blind again", async () => {
    const rhymeCtx = { ...ctx, options: { ...ctx.options, voice: "rhyming-mischief" as const, readingLevel: "4-6" as const } };
    const outline = await spineOutline(rhymeCtx);
    const long = manuscript("Verse");
    long.pages[0].text = "Oliver woke in his moon pajamas and gasped at the wonderful sight\nhis bed on the ceiling!";
    const stillLong = manuscript("Verse");
    stillLong.pages[0].text = "Oliver woke in his moon pajamas and gasped at the curious sight\nhis bed on the ceiling!";
    const { caller, prompts } = scripted([reply(manuscript("Prose")), blind(), pass(), reply(long), reply(stillLong), blind(), pass(), reply(await art())]);
    const saved: string[] = [];
    const written = await provider(caller).writeManuscript(outline, rhymeCtx, { save: async (cp) => void saved.push(cp.stage) });
    expect(prompts[0]).toMatch(/clear, warm storytelling prose \(no rhyme\)/);
    expect(prompts[3]).toMatch(/turn it into verse/);
    expect(prompts[3]).toContain("Prose page 4."); // the verse is made from the checked prose
    expect(prompts[4]).toMatch(/Page 1, line 1 has 12 words; keep every line to 10 words or fewer/);
    expect(prompts[5]).toContain("Verse page 4."); // the verse is read blind
    expect(prompts).toHaveLength(7);
    expect(written.value.pages[0].text).toContain("curious sight");
    expect(written.value.editorNotes.map((n) => n.round)).toEqual(["draft", "verse"]);
    expect(saved).toEqual(["written", "polished", "versified", "done"]);
  });

  it("art direction may not show a prop before the words introduce it", async () => {
    const outline = await spineOutline(ctx);
    const m = manuscript("Draft");
    m.pages[3].text = "Professor Quibblewick handed Teddy the Gizmo.";
    const a = await art();
    const early = { ...a, props: [{ name: "Gizmo" }], pages: a.pages.map((p) => (p.pageNumber === 3 ? { ...p, scene: { ...p.scene, mustShow: [...p.scene.mustShow, "Teddy holding the brass Giggle-Gizmo"] } } : p)) };
    const fixed = { ...a, props: [{ name: "Gizmo" }] };
    const { caller, prompts } = scripted([reply(m), blind(), pass(), reply(early), reply(fixed)]);
    await provider(caller).generatePages(outline, ctx);
    expect(prompts[4]).toMatch(/Page 3's picture shows "Gizmo", but the words only bring it in on page 4/);
  });

  it("trims wordy editor notes and continuity facts instead of failing the step", async () => {
    const long = "The bell rule is never stated, so a reader wonders why pulling the rope does nothing at all. ".repeat(8);
    const outline = { ...(await spineOutline(ctx)), continuity: [{ fact: long, fromPage: 1, toPage: 12 }] };
    const { caller, prompts } = scripted([reply(outline), reply(manuscript("Draft")), blind(), reply({ verdict: "pass", overall: long, retellingMatch: 1, issues: Array.from({ length: 15 }, (_, i) => ({ page: i, problem: long, fix: long })) }), reply(await art())]);
    // (verdict "pass" with leftover notes: no rewrite)
    const p = provider(caller);
    const o = await p.generateOutline(ctx);
    expect(o.value.continuity[0].fact.length).toBeLessThanOrEqual(240);
    expect(o.value.continuity[0].fact).toMatch(/\.\.\.$/);
    const res = await p.generatePages(o.value, ctx);
    expect(prompts).toHaveLength(5); // no retries
    const notes = res.value.editorNotes[0];
    expect(notes.issues).toHaveLength(12);
    expect(notes.issues.every((x) => x.problem.length <= 400 && x.fix.length <= 400)).toBe(true);
  });

  it("asks art direction again when a page has no must-show details", async () => {
    const outline = await spineOutline(ctx);
    const a = await art();
    const missing = { ...a, pages: a.pages.map((p, i) => (i === 2 ? { ...p, scene: { ...p.scene, mustShow: [] } } : p)) };
    const { caller, prompts } = scripted([reply(manuscript("Draft")), blind(), pass(), reply(missing), reply(a)]);
    await provider(caller).generatePages(outline, ctx);
    expect(prompts[4]).toMatch(/List mustShow details for pages 3/);
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
    const f = jsonFormat(z.object({ title: z.string(), pages: z.array(z.object({ text: z.string() })) }));
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
