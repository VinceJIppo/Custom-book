import { describe, expect, it } from "vitest";
import { AnthropicStoryProvider } from "@/lib/providers/anthropic/story";
import type { ModelCallResult, ModelCaller } from "@/lib/providers/anthropic/client";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { applySetup, setupPageCount, setupProblems } from "@/lib/books/setup";
import { EDITOR_SYSTEM_PROMPT, STORY_SYSTEM_PROMPT, manuscriptPrompt } from "@/lib/providers/anthropic/storyPrompts";
import { OutlineSchema, type StorySetup } from "@/lib/schemas/story";
import { sampleChild, sampleOptions, superhero } from "./helpers";

const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, length: 12 as const } };

function reply(obj: unknown): ModelCallResult {
  return { text: JSON.stringify(obj), stopReason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 1000, output_tokens: 1000 } };
}
function scripted(replies: ModelCallResult[]) {
  const prompts: Array<{ system: string; content: string }> = [];
  const caller: ModelCaller = async ({ system, content }) => {
    prompts.push({ system, content: typeof content === "string" ? content : JSON.stringify(content) });
    const r = replies.shift();
    if (!r) throw new Error("no more replies");
    return r;
  };
  return { caller, prompts };
}

const beat = (n: number, summary: string) => ({ pageNumber: n, beat: `Opening ${n}`, summary, causeFromPrevious: n > 1 ? "because of the page before" : "", characters: ["Teddy"], visualState: "a sunny morning" });
const goodSetup: StorySetup = {
  homeWorld: "Teddy lives above the bakery in Sparkport and helps ring the town bell every morning.",
  heroWant: "Teddy loves hearing the whole town laugh when the bell goes DING.",
  innerNeed: "To share first, even when he's shy.",
  incitingIncident: "One day the bell won't ring, because the town has stopped laughing together.",
  whyItMatters: "Without the bell, Grandma's bakery never opens and Teddy's birthday party can't start.",
  whyTheHero: "The Mayor is stuck in a meeting and only Teddy knows the bell's secret.",
  decision: "Teddy grabs his cheese sandwich and says, \"I'll make them laugh!\"",
  journeyStartsOnPage: 4,
  plants: ["the cheese sandwich in Teddy's pocket"],
  openingPages: [beat(1, "Teddy rings the bell with Grandma and the town giggles."), beat(2, "One day the bell goes quiet."), beat(3, "Teddy decides to fix it.")],
};

describe("how many opening pages a book gets", () => {
  it("is about a quarter of the story", () => {
    expect([12, 16, 20, 24].map(setupPageCount)).toEqual([3, 4, 5, 6]);
  });

  it("checks the plan fits the book", () => {
    expect(setupProblems(goodSetup, 12)).toEqual([]);
    const bad = { ...goodSetup, journeyStartsOnPage: 2, openingPages: [beat(1, "One day the bell broke.")] };
    const problems = setupProblems(bad, 12).join(" ");
    expect(problems).toMatch(/journeyStartsOnPage must be 4/);
    expect(problems).toMatch(/exactly pages 1, 2, 3/);
    expect(problems).toMatch(/Page 1 shows the hero's everyday world/);
  });
});

describe("the setup agent", () => {
  it("plans the opening, retries a plan that doesn't fit, and the writer gets it", async () => {
    const mock = new MockStoryProvider();
    const spine = (await mock.generateOutline(ctx)).value;
    const tooShort = { ...goodSetup, journeyStartsOnPage: 3, openingPages: goodSetup.openingPages.slice(0, 2) };
    const { caller, prompts } = scripted([reply(tooShort), reply(goodSetup)]);
    const res = await new AnthropicStoryProvider({ model: "claude-sonnet-5-5", effort: "high", fallbacks: true, caller }).planSetup(spine, ctx);
    expect(prompts[0].system).toMatch(/specializes in openings/);
    expect(prompts[0].content).toMatch(/Plan the opening: pages 1 to 3\. The adventure itself starts on page 4/);
    expect(prompts[1].content).toMatch(/journeyStartsOnPage must be 4/);
    expect(res.usage.attempts).toBe(2);

    const outline = applySetup(spine, res.value);
    expect(OutlineSchema.parse(outline).setup?.decision).toMatch(/I'll make them laugh/);
    expect(outline.pages).toHaveLength(12);
    expect(outline.pages.slice(0, 3).map((p) => p.beat)).toEqual(["Opening 1", "Opening 2", "Opening 3"]);
    expect(outline.pages[3]).toEqual(expect.objectContaining({ pageNumber: 4, summary: spine.pages[3].summary }));
    expect(manuscriptPrompt(ctx, outline)).toMatch(/Pages 1 to 3 are the opening, planned in setup/);
  });

  it("writer and editor both know how a story should open", () => {
    expect(STORY_SYSTEM_PROMPT).toMatch(/Never start in the middle of the action/);
    expect(EDITOR_SYSTEM_PROMPT).toMatch(/Does the opening set the story up\?/);
  });
});
