import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { drainQueue } from "@/lib/jobs/runner";
import { resetProviders } from "@/lib/providers/registry";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { continuityProblems } from "@/lib/books/continuity";
import { appearanceText, completeGuide, guideFor, guideLines, mentions, withSpecies } from "@/lib/books/appearance";
import { loadBuiltInThemeFiles } from "@/lib/themes";
import { buildIllustrationPrompt } from "@/lib/providers/image/prompt";
import { describeContext, EDITOR_SYSTEM_PROMPT, STORY_SYSTEM_PROMPT } from "@/lib/providers/anthropic/storyPrompts";
import { MockImageProvider } from "@/lib/providers/image/mock";
import { MockUpscaler } from "@/lib/providers/upscale/mock";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { MockModerationProvider } from "@/lib/providers/moderation/mock";
import { storyContextFor } from "@/lib/books/context";
import type { IllustrationRequest } from "@/lib/providers/image/types";
import type { PageCheckInput, VisionProvider } from "@/lib/providers/vision/types";
import type { ImageData } from "@/lib/providers/types";
import { makeUser, resetDb } from "./helpers";

const outline = {
  characters: [
    { name: "Teddy", species: "a five-year-old boy", look: "green raincoat, no glasses, no hat" },
    { name: "Pip", species: "a small red fox", look: "bushy tail with a white tip, blue scarf" },
  ],
  setups: [{ item: "the golden acorn", setUpOnPage: 2, paysOffOnPage: 9 }],
  continuity: [{ fact: "Teddy carries his yellow lantern", fromPage: 1, toPage: 12 }],
};
const pages = (texts: string[]) => texts.map((text, i) => ({ pageNumber: i + 1, text }));

describe("continuity checks on the words", () => {
  it("flags glasses that appear partway through an adventure", () => {
    const issues = continuityProblems(pages(["Teddy and Pip set off.", "They found a golden acorn.", "Teddy pushed up his glasses and looked."]), outline, "Teddy", "hair: brown; no glasses; outfit: green raincoat");
    expect(issues.some((i) => i.page === 3 && /glasses/.test(i.problem))).toBe(true);
    expect(issues.some((i) => /doesn't wear glasses/.test(i.problem))).toBe(true);
  });

  it("flags a named animal called a different kind of animal, but not a puppy/dog pair", () => {
    const issues = continuityProblems(pages(["Pip the fox yawned.", "Pip the little puppy ran ahead."]), outline, "Teddy");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ page: 2 });
    expect(issues[0].problem).toContain("a small red fox");
    const dog = { ...outline, characters: [{ name: "Biscuit", species: "a brown dog", look: "floppy ears" }] };
    expect(continuityProblems(pages(["Biscuit the puppy wagged."]), dog, "Teddy")).toEqual([]);
  });

  it("leaves planned looks and props alone", () => {
    const ok = continuityProblems(pages(["Pip wore his blue scarf.", "Pip's scarf flapped in the wind.", "The lantern glowed."]), outline, "Teddy", "no glasses");
    expect(ok).toEqual([]);
  });
});

describe("character guide in prompts", () => {
  it("says 'no glasses' explicitly from a character sheet", () => {
    expect(appearanceText({ hair: "short brown", eyes: "brown", skinTone: "light", faceShape: "round", glasses: "none", freckles: "none", signatureOutfit: "green raincoat", otherDetails: "" })).toContain("no glasses");
  });

  it("picks the characters a scene names and puts them in the picture prompt", () => {
    const guide = guideFor(outline as never, ["Pip"], "Teddy follows Pip");
    expect(guide.map((g) => g.name)).toEqual(["Teddy", "Pip"]);
    const req = {
      characterRef: null,
      bible: null,
      childName: "Teddy",
      scene: { action: "Teddy follows Pip", characters: ["Teddy", "Pip"], setting: "woods", mood: "calm", framing: "wide", mustShow: [], continuity: "" },
      style: "crayon",
      aspect: 1,
      textZone: "top",
      palette: ["#123456"],
      label: "Page 3",
      story: { summary: "", pageText: "", characters: guideLines(guide) },
    } as IllustrationRequest;
    const prompt = buildIllustrationPrompt(req);
    expect(prompt).toContain("Pip is a small red fox on every page (never any other kind of animal or creature): bushy tail with a white tip, blue scarf");
    expect(prompt).toMatch(/never add glasses/);
  });

  it("tells the writer and editor that characters never change", () => {
    expect(STORY_SYSTEM_PROMPT).toMatch(/Nobody gains or loses glasses/);
    expect(EDITOR_SYSTEM_PROMPT).toMatch(/animal changes kind/);
  });
});

describe("every animal has one stated kind", () => {
  it("matches names by their distinctive words, not by 'Old' or 'The'", () => {
    expect(mentions("Old Willa waddles over", "Old Willa")).toBe(true);
    expect(mentions("Willa smiles", "Old Willa")).toBe(true);
    expect(mentions("the old oak creaks", "Old Willa")).toBe(false);
    expect(mentions("the sea is calm", "The Puffer Twins")).toBe(false);
    expect(mentions("the Puffer Twins puff up", "The Puffer Twins")).toBe(true);
  });

  it("adds the theme's characters and the pet when the plan left them out", () => {
    const meadow = loadBuiltInThemeFiles().find((t) => t.id === "quiet-meadow")!;
    const guide = completeGuide([{ name: "Charlie", species: "a one-year-old girl", look: "pink dress" }], {
      theme: meadow,
      child: { petName: "Biscuit", petType: "beagle puppy" } as never,
      options: { includePet: true } as never,
    });
    expect(guide.find((c) => c.name === "Old Willa")?.species).toBe("a tall grey goose");
    expect(guide.find((c) => c.name === "Bramble")?.species).toBe("a little round hedgehog");
    expect(guide.find((c) => c.name === "Biscuit")?.species).toMatch(/^a beagle puppy/);
    // Already listed characters aren't duplicated.
    expect(completeGuide(guide, { theme: meadow, child: {} as never, options: {} as never })).toHaveLength(guide.length);
  });

  it("writes each character's kind into the scene's character list", () => {
    const guide = [
      { name: "Old Willa", species: "a tall grey goose", look: "half-moon spectacles" },
      { name: "Bramble", species: "a little round hedgehog", look: "moss scarf" },
    ];
    const scene = withSpecies({ characters: ["Charlie", "Old Willa", "Bramble the hedgehog"] }, guide);
    expect(scene.characters).toEqual(["Charlie", "Old Willa (a tall grey goose)", "Bramble the hedgehog"]);
  });
});

describe("continuity through a whole book", () => {
  let userId: string;
  let themeId: string;
  beforeEach(async () => {
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    themeId = (await listThemesForUser(userId)).find((t) => t.slug === "superhero-squad")!.id;
  });
  afterEach(() => resetProviders());

  it("every picture and every picture check gets the book's character guide", async () => {
    const reqs: IllustrationRequest[] = [];
    const checks: PageCheckInput[] = [];
    const image = new MockImageProvider();
    image.generateIllustration = async (req) => {
      reqs.push(req);
      const data = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#abcdef" } }).png().toBuffer();
      const value: ImageData = { data, mimeType: "image/png", width: 100, height: 100 };
      return { value, usage: { provider: "fake", costUsd: 0, imageCalls: 1 } };
    };
    const vision: VisionProvider = {
      name: "fake",
      model: "fake",
      async checkPhoto() {
        return { value: { faces: 1, ok: true, problems: [] }, usage: { provider: "fake", costUsd: 0 } };
      },
      async checkPage(input) {
        checks.push(input);
        return { value: { likeness: null, story: { score: 1, missing: [] }, ok: true }, usage: { provider: "fake", costUsd: 0 } };
      },
    };
    resetProviders({ image, vision, upscaler: new MockUpscaler(), story: new MockStoryProvider(), moderation: new MockModerationProvider() });
    const child = await createChild(userId, { firstName: "Theodore", nickname: "Teddy", age: 5, pronouns: "he", petName: "Biscuit", petType: "puppy", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options: { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: true, includeFriend: false } });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const book = await db.book.findUniqueOrThrow({ where: { id: res.bookId } });
    expect(book.status).toBe("ready");
    const guide = (book.outline as { characters: Array<{ name: string; species: string }> }).characters;
    expect(guide.find((c) => c.name === "Biscuit")?.species).toBe("a puppy");
    // The setup agent planned the opening before the words were written.
    expect((book.outline as { setup?: { journeyStartsOnPage: number } }).setup?.journeyStartsOnPage).toBe(4);
    expect(reqs).toHaveLength(13);
    // The pet and the theme's characters get their kind written into the scene.
    expect(guide.some((c) => c.name !== "Teddy" && c.name !== "Biscuit")).toBe(true);
    const named = reqs.flatMap((r) => r.scene.characters).filter((c) => /\(/.test(c));
    expect(named.length).toBeGreaterThan(0);
    expect(reqs.every((r) => (r.story?.characters ?? []).some((l) => l.startsWith("Teddy is a 5-year-old child")))).toBe(true);
    expect(checks.every((c) => c.continuity.includes("Teddy is a 5-year-old child"))).toBe(true);
    // The writer sees the pet's kind and each person's look.
    const ctx = { ...storyContextFor(book), appearance: { hero: "hair: brown; no glasses" } };
    expect(describeContext(ctx)).toContain('"appearance": "hair: brown; no glasses"');
  });
});
