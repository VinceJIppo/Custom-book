import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createChild, createGrownUp, listPeople } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { storyContextFor } from "@/lib/books/context";
import { buildBookView } from "@/lib/books/view";
import { drainQueue } from "@/lib/jobs/runner";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { describeContext, outlinePrompt, spotlightName, STORY_SYSTEM_PROMPT } from "@/lib/providers/anthropic/storyPrompts";
import { buildCharacterSheetPrompt, buildIllustrationPrompt } from "@/lib/providers/image/prompt";
import { referenceImages } from "@/lib/providers/image/types";
import { castRefsFor } from "@/lib/jobs/handlers/illustrate";
import { makeUser, resetDb } from "./helpers";

const options = { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };
const img = (w: number) => ({ data: Buffer.from("x"), mimeType: "image/png", width: w, height: w });

describe("stories with more than one real person", () => {
  let userId: string;
  let childId: string;
  let momId: string;
  let themeId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    themeId = (await listThemesForUser(userId)).find((t) => t.slug === "superhero-squad")!.id;
    const child = await createChild(userId, { firstName: "Oliver", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    const mom = await createGrownUp(userId, { firstName: "Bina", nickname: "Mama", relationship: "Mom", pronouns: "she", about: "A nurse who loves gardening", look: "long curly black hair, round glasses" });
    if (!child.ok || !mom.ok) throw new Error("setup");
    childId = child.id;
    momId = mom.id;
  });

  it("grown-ups are people with a relationship, checked like any parent text", async () => {
    const p = await db.childProfile.findUniqueOrThrow({ where: { id: momId } });
    expect(p).toMatchObject({ kind: "grownup", relationship: "Mom", nickname: "Mama", age: 0 });
    const bad = await createGrownUp(userId, { firstName: "X", relationship: "", pronouns: "she" });
    expect(bad.ok).toBe(false);
    const protectedText = await createGrownUp(userId, { firstName: "Y", relationship: "Dad", pronouns: "he", about: "dresses up as Spider-Man" });
    expect(protectedText.ok).toBe(false);
    expect((await listPeople(userId)).map((x) => x.kind).sort()).toEqual(["child", "grownup"]);
  });

  it("a book can star Mom, with her secret, and the whole pipeline carries the cast", async () => {
    const res = await createAndStartBook(userId, {
      childId,
      themeId,
      options: { ...options, cast: [{ profileId: momId, part: "Mama is secretly a superhero, and Oliver doesn't know it until the end." }], spotlightId: momId, storyAbout: "Mama's secret job saving the city at night." },
    });
    if (!res.ok) throw new Error(res.message);
    const book = await db.book.findUniqueOrThrow({ where: { id: res.bookId }, include: { pages: true } });
    const ctx = storyContextFor(book);
    expect(ctx.cast).toHaveLength(1);
    expect(ctx.cast![0]).toMatchObject({ name: "Bina", nickname: "Mama", relationship: "Mom", part: expect.stringMatching(/secretly a superhero/) });
    expect(spotlightName(ctx)).toBe("Mama");

    // What the story writer receives.
    const context = JSON.parse(describeContext(ctx));
    expect(context.otherPeopleInTheStory[0]).toMatchObject({ name: "Bina", whatTheChildCallsThem: "Mama", about: "A nurse who loves gardening" });
    expect(context.storyCentersOn).toBe("Mama");
    expect(context.whatThisStoryIsAbout).toMatch(/secret job/);
    expect(STORY_SYSTEM_PROMPT).toMatch(/secret .* is a gift to the reader/);
    expect(outlinePrompt(ctx)).toContain("Mama");

    await drainQueue();
    const done = await db.book.findUniqueOrThrow({ where: { id: res.bookId }, include: { pages: true } });
    expect(done.status).toBe("ready");
    // Mama appears in some scenes, and the cover says who stars.
    const scenes = done.pages.filter((p) => p.kind === "story").map((p) => p.scene as { characters: string[] });
    expect(scenes.some((s) => s.characters.includes("Mama"))).toBe(true);
    expect((await buildBookView(done)).starring).toBe("Oliver and Mama");
  });

  it("each picture gets the references of the people in it, in order", async () => {
    const res = await createAndStartBook(userId, { childId, themeId, options: { ...options, cast: [{ profileId: momId }] } });
    if (!res.ok) throw new Error(res.message);
    const book = await db.book.findUniqueOrThrow({ where: { id: res.bookId } });
    const ctx = storyContextFor(book);
    const withMom = await castRefsFor(ctx, { action: "Mama hugs Oliver", characters: ["Oliver", "Mama"], setting: "", mood: "", framing: "", mustShow: [], continuity: "" }, "Oliver");
    expect(withMom).toEqual([{ name: "Mama", label: "Oliver's mom", image: null, bible: null, look: "long curly black hair, round glasses" }]);
    // "Mom" must not match inside other words.
    const without = await castRefsFor(ctx, { action: "A moment of calm", characters: ["Oliver"], setting: "", mood: "", framing: "", mustShow: [], continuity: "" }, "Oliver");
    expect(without).toEqual([]);

    const prompt = buildIllustrationPrompt({
      characterRef: img(10),
      bible: null,
      childName: "Oliver",
      scene: { action: "Mama hugs Oliver", characters: ["Oliver", "Mama"], setting: "home", mood: "warm", framing: "wide", mustShow: [], continuity: "" },
      style: "crayon",
      aspect: 1,
      textZone: "bottom",
      palette: [],
      label: "Page 1",
      cast: [
        { name: "Mama", label: "Oliver's mom", image: img(20), bible: null },
        { name: "Grandpa", label: "Oliver's grandpa", image: null, bible: null, look: "white beard, red cap" },
      ],
    });
    expect(prompt).toMatch(/second attached image is the approved character sheet for Mama, Oliver's mom/);
    expect(prompt).toMatch(/Grandpa, Oliver's grandpa, looks like this: white beard, red cap/);
    expect(referenceImages({ characterRef: img(10), cast: [{ name: "Mama", label: "", image: img(20), bible: null }] }).map((i) => i.width)).toEqual([10, 20]);
  });

  it("checks the cast: own people only, the hero excluded, spotlight must be in the story", async () => {
    const other = await makeUser("other@example.com");
    const stranger = await createGrownUp(other.id, { firstName: "Z", relationship: "Dad", pronouns: "he" });
    if (!stranger.ok) throw new Error("setup");
    expect((await createAndStartBook(userId, { childId, themeId, options: { ...options, cast: [{ profileId: stranger.id }] } })).ok).toBe(false);
    expect((await createAndStartBook(userId, { childId, themeId, options: { ...options, spotlightId: momId } })).ok).toBe(false);
    expect((await createAndStartBook(userId, { childId: momId, themeId, options })).ok).toBe(false);
    const withSelf = await createAndStartBook(userId, { childId, themeId, options: { ...options, cast: [{ profileId: childId }] } });
    if (!withSelf.ok) throw new Error(withSelf.message);
    expect(storyContextFor(await db.book.findUniqueOrThrow({ where: { id: withSelf.bookId } })).cast).toEqual([]);
    const blocked = await createAndStartBook(userId, { childId, themeId, options: { ...options, storyAbout: "Mom is secretly Spider-Man" } });
    expect(blocked.ok).toBe(false);
  });

  it("grown-ups get a grown-up character sheet (not a child's)", () => {
    const p = buildCharacterSheetPrompt({ style: "crayon", variant: 0, subject: "grownup" });
    expect(p).toMatch(/real grown-up/);
    expect(p).not.toMatch(/Keep the child's age/);
    expect(buildCharacterSheetPrompt({ style: "crayon", variant: 0 })).toMatch(/Keep the child's age/);
  });
});
