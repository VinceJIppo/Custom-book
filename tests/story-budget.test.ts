import { describe, expect, it } from "vitest";
import { budgetProblems, budgetText, storyBudget } from "@/lib/books/budget";
import { applySetup, setupProblems } from "@/lib/books/setup";
import { outlinePrompt, manuscriptPrompt, STORY_SYSTEM_PROMPT } from "@/lib/providers/anthropic/storyPrompts";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import type { StorySetup } from "@/lib/schemas/story";
import { sampleChild, sampleOptions, superhero } from "./helpers";

const ctx = { child: sampleChild, theme: superhero(), options: { ...sampleOptions, length: 12 as const, voice: "classic" as const } };

describe("story budget", () => {
  it("fits fewer characters and tries into shorter books", () => {
    expect(storyBudget(12)).toEqual({ helpers: 2, realParts: 2, attempts: [1, 1] });
    expect(storyBudget(24).attempts).toEqual([2, 3]);
    expect(budgetProblems(1, 12)).toEqual([]);
    expect(budgetProblems(3, 12)[0]).toMatch(/Plan 1 failed try for a 12-page book \(you planned 3\)/);
    expect(budgetText(16)).toMatch(/Theme characters are optional/);
  });

  it("the planner writes a kid summary first, and the writer must show every sentence of it", async () => {
    expect(outlinePrompt(ctx)).toMatch(/kidSummary: first, the whole story in five to seven very short sentences/);
    expect(outlinePrompt(ctx)).toMatch(/STORY BUDGET for 12 pages/);
    const outline = { ...(await new MockStoryProvider().generateOutline(ctx)).value, kidSummary: ["Nell loves the ducks.", "But Dot is stuck."] };
    expect(manuscriptPrompt(ctx, outline)).toMatch(/Every sentence of kidSummary must happen clearly in the words/);
    expect(STORY_SYSTEM_PROMPT).toMatch(/Silly worlds still make sense/);
    expect(STORY_SYSTEM_PROMPT).toMatch(/What "makes sense" looks like/);
  });
});

describe("the setup agent re-plans every page", () => {
  it("uses its full page plan, so the opening and adventure aren't stitched together", async () => {
    const spine = (await new MockStoryProvider().generateOutline(ctx)).value;
    const beat = (n: number, summary: string) => ({ pageNumber: n, beat: `B${n}`, summary, causeFromPrevious: n > 1 ? "so" : "", characters: ["Teddy"], visualState: "" });
    const opening = [beat(1, "Teddy at home."), beat(2, "The bell stops."), beat(3, "Teddy decides to help.")];
    const pages = [...opening, ...Array.from({ length: 9 }, (_, i) => beat(i + 4, `Adventure ${i + 4}`))];
    const setup: StorySetup = { homeWorld: "Home above the bakery.", heroWant: "Loves the bell.", innerNeed: "", incitingIncident: "One day the bell stops.", whyItMatters: "No bell, no party.", whyTheHero: "Only Teddy knows the secret.", decision: "Teddy says he'll fix it.", journeyStartsOnPage: 4, plants: [], openingPages: opening, pages };
    expect(setupProblems(setup, 12)).toEqual([]);
    const merged = applySetup(spine, setup);
    expect(merged.pages.map((p) => p.summary)).toEqual(pages.map((p) => p.summary));
    // A full plan with a missing page, or an opening that differs from openingPages, is sent back.
    expect(setupProblems({ ...setup, pages: pages.slice(0, 11) }, 12).join(" ")).toMatch(/every page, 1 to 12/);
    expect(setupProblems({ ...setup, pages: [beat(1, "Something else."), ...pages.slice(1)] }, 12).join(" ")).toMatch(/must be the same as openingPages/);
  });
});
