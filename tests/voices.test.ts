import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_VOICE, VOICES, VOICE_IDS, voiceFor } from "@/lib/schemas/voices";
import { BookOptionsSchema } from "@/lib/schemas/book";
import { artDirectionPrompt, editorPrompt, manuscriptPrompt, outlinePrompt, readingRule, rewritePrompt, revisePrompt } from "@/lib/providers/anthropic/storyPrompts";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { db } from "@/lib/db";
import { makeUser, resetDb, sampleChild, sampleOptions, superhero } from "./helpers";
import type { StoryContext } from "@/lib/providers/story/types";
import type { VoiceId } from "@/lib/schemas/voices";
import type { ReadingLevel } from "@/lib/schemas/book";

const ctx = (voice: VoiceId | undefined, readingLevel: ReadingLevel = "4-6"): StoryContext => ({
  child: sampleChild,
  theme: superhero(),
  options: { ...sampleOptions, voice, readingLevel },
});

describe("voice definitions", () => {
  it("default to rhyming and mischievous; books from before voices read as classic", () => {
    expect(DEFAULT_VOICE).toBe("rhyming-mischief");
    expect(voiceFor({}).id).toBe("classic");
    expect(voiceFor({ voice: "bedtime" }).id).toBe("bedtime");
  });

  it("describe qualities, never real authors, and forbid copying", () => {
    for (const id of VOICE_IDS) {
      const text = JSON.stringify(VOICES[id]);
      expect(text).not.toMatch(/seuss|geisel|dahl|roald|grinch|oompa|wonka|cat in the hat/i);
      expect(VOICES[id].guide).toMatch(/Never quote or closely imitate any published book/);
      expect(VOICES[id].sample.length).toBeGreaterThan(10);
    }
  });

  it("is part of the book options and optional for old books", () => {
    const base = { length: 16, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };
    expect(BookOptionsSchema.parse(base).voice).toBeUndefined();
    expect(BookOptionsSchema.parse({ ...base, voice: "adventure" }).voice).toBe("adventure");
    expect(BookOptionsSchema.safeParse({ ...base, voice: "shakespeare" }).success).toBe(false);
  });
});

describe("story prompts carry the voice", () => {
  it("rhyming voice replaces the reading-level rule and adds the style guide everywhere", async () => {
    const c = ctx("rhyming-mischief", "2-4");
    expect(readingRule(c)).toMatch(/One rhyming couplet per page/);
    const outline = (await new MockStoryProvider().generateOutline(c)).value;
    const draft = [{ pageNumber: 1, text: "A line." }];
    for (const p of [outlinePrompt(c), manuscriptPrompt(c, outline), rewritePrompt(c, outline, draft, [{ page: 1, problem: "x", fix: "y" }]), revisePrompt("Old text", "a scene", "make it shorter", c)]) {
      expect(p).toContain("STORY VOICE: Rhyming and mischievous");
      expect(p).toMatch(/rhyming couplets/);
    }
    expect(manuscriptPrompt(c, outline)).toMatch(/One rhyming couplet per page/);
    expect(editorPrompt(c, outline, draft)).toContain('"Rhyming and mischievous" voice');
    expect(artDirectionPrompt(c, outline, draft)).toContain("A line.");
  });

  it("classic voice keeps the default reading rules", () => {
    expect(readingRule(ctx("classic", "2-4"))).toMatch(/One short, simple sentence per page/);
    expect(outlinePrompt(ctx("classic"))).toContain("STORY VOICE: Classic storybook");
  });
});

describe("offline writer in the rhyming voice", () => {
  const p = new MockStoryProvider();
  async function pages(voice: VoiceId, level: ReadingLevel) {
    const c = ctx(voice, level);
    return (await p.generatePages((await p.generateOutline(c)).value, c)).value.pages;
  }
  it("writes one couplet for ages 2-4, two for 4-6, prose plus a couplet for 6-8", async () => {
    for (const pg of await pages("rhyming-mischief", "2-4")) expect(pg.text.split("\n")).toHaveLength(2);
    for (const pg of await pages("rhyming-mischief", "4-6")) expect(pg.text.split("\n")).toHaveLength(4);
    for (const pg of await pages("rhyming-mischief", "6-8")) expect(pg.text).toMatch(/[.!?"]\n\n.+\n.+$/);
  });
  it("fills every placeholder, and classic stays prose", async () => {
    for (const pg of await pages("rhyming-mischief", "4-6")) expect(pg.text).not.toMatch(/\{\w+\}/);
    for (const pg of await pages("classic", "4-6")) expect(pg.text).not.toContain("\n");
  });
});

describe("new books default to the rhyming voice", () => {
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
  });
  it("records the voice on the book", async () => {
    const user = await makeUser();
    const themeId = (await listThemesForUser(user.id)).find((t) => t.slug === "space-explorer")!.id;
    const child = await createChild(user.id, { firstName: "Max", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const options = { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };
    const a = await createAndStartBook(user.id, { childId: child.id, themeId, options });
    const b = await createAndStartBook(user.id, { childId: child.id, themeId, options: { ...options, voice: "bedtime" } });
    if (!a.ok || !b.ok) throw new Error("book");
    expect(((await db.book.findUniqueOrThrow({ where: { id: a.bookId } })).options as { voice?: string }).voice).toBe("rhyming-mischief");
    expect(((await db.book.findUniqueOrThrow({ where: { id: b.bookId } })).options as { voice?: string }).voice).toBe("bedtime");
  });
});

describe("offline writer grammar", () => {
  it("uses singular animals with the right article, and keeps lowercase verse lines", async () => {
    const p = new MockStoryProvider();
    for (const [animals, expected] of [[["otters"], "an otter"], [["puppies"], "a puppy"], [["owl"], "an owl"]] as const) {
      const c: StoryContext = { child: { ...sampleChild, favorites: { ...sampleChild.favorites, animals: [...animals] } }, theme: superhero(), options: { ...sampleOptions, length: 16, voice: "rhyming-mischief" } };
      const all = (await p.generatePages((await p.generateOutline(c)).value, c)).value.pages.map((pg) => pg.text).join("\n");
      expect(all).toContain(`Along came ${expected}`);
    }
    const c = ctx("rhyming-mischief", "2-4");
    const first = (await p.generatePages((await p.generateOutline(c)).value, c)).value.pages[0].text;
    expect(first.split("\n")[1]).toMatch(/^and /);
  });
});
