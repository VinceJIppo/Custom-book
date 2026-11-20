import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createChild, deleteChildEverything } from "@/lib/children/service";
import { createAndStartBook, retryFailedJobs } from "@/lib/books/service";
import { drainQueue } from "@/lib/jobs/runner";
import { buildBookView } from "@/lib/books/view";
import { getStorage, keys } from "@/lib/storage";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { makeUser, resetDb } from "./helpers";

const childInput = {
  firstName: "Theodore",
  nickname: "Teddy",
  age: 5,
  pronouns: "he",
  favorites: { colors: ["green"], animals: ["otters"], foods: ["pancakes"], activities: ["building forts"] },
  petName: "Biscuit",
  petType: "puppy",
  friends: ["Maya"],
  lesson: "bravery",
};
const options = { length: 16, readingLevel: "4-6", style: "bold-comic", trimSize: "square-8.5", includePet: true, includeFriend: true };

describe("end-to-end generation with mocks (no API keys)", () => {
  let userId: string;
  let themeId: string;
  beforeEach(async () => {
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    themeId = (await listThemesForUser(userId)).find((t) => t.slug === "superhero-squad")!.id;
  });

  it("profile -> theme -> 16-page book with art, ready for the flipbook", async () => {
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error(JSON.stringify(child));
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();

    const book = await db.book.findUniqueOrThrow({ where: { id: res.bookId }, include: { pages: true } });
    expect(book.status).toBe("ready");
    expect(book.title).toContain("Teddy");
    const story = book.pages.filter((p) => p.kind === "story");
    expect(story).toHaveLength(16);
    expect(story.every((p) => p.imageStatus === "ready" && p.imageKey)).toBe(true);
    expect(book.coverImageKey).toBeTruthy();
    expect(book.pages.map((p) => p.kind).filter((k) => k !== "story")).toEqual(expect.arrayContaining(["belongsTo", "dedication", "title", "theEnd"]));

    const img = await getStorage().get(story[0].imageKey!);
    expect(img?.meta.contentType).toBe("image/svg+xml");

    const view = await buildBookView(book);
    expect(view.pages).toHaveLength(24); // 20 content pages padded to the product minimum
    expect(view.pages.filter((p) => p.kind === "story" && p.imageUrl).length).toBeGreaterThanOrEqual(16);
    expect(view.pages[0].imageUrl ?? "").toBe("");

    const jobs = await db.generationJob.findMany({ where: { bookId: book.id } });
    expect(jobs.every((j) => j.status === "succeeded")).toBe(true);
    expect(jobs.filter((j) => j.type === "page.illustrate")).toHaveLength(16);
  });

  it("refuses protected characters with a friendly message and genre suggestions", async () => {
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options: { ...options, instructions: "Have Batman help him" } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/Batman/);
      expect(res.suggestedThemeIds).toContain("superhero-squad");
    }
    expect(await db.book.count()).toBe(0);

    const bad = await createChild(userId, { ...childInput, favorites: { ...childInput.favorites, activities: ["watching Paw Patrol"] } });
    expect(bad.ok).toBe(false);
  });

  it("allows a child whose real name matches a character", async () => {
    const res = await createChild(userId, { ...childInput, firstName: "Elsa", nickname: undefined });
    expect(res.ok).toBe(true);
  });

  it("enforces the daily book cap", async () => {
    process.env.DAILY_BOOK_CAP = "1";
    const { resetConfigCache } = await import("@/lib/config");
    resetConfigCache();
    try {
      const child = await createChild(userId, childInput);
      if (!child.ok) throw new Error("child");
      expect((await createAndStartBook(userId, { childId: child.id, themeId, options })).ok).toBe(true);
      const second = await createAndStartBook(userId, { childId: child.id, themeId, options });
      expect(second.ok).toBe(false);
    } finally {
      delete process.env.DAILY_BOOK_CAP;
      resetConfigCache();
    }
  });

  it("only redoes what failed", async () => {
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const page = await db.page.findFirstOrThrow({ where: { bookId: res.bookId, kind: "story" } });
    const job = await db.generationJob.findFirstOrThrow({ where: { pageId: page.id } });
    await db.generationJob.update({ where: { id: job.id }, data: { status: "failed" } });
    await db.page.update({ where: { id: page.id }, data: { imageStatus: "failed" } });
    expect(await retryFailedJobs(userId, res.bookId)).toBe(1);
    expect(await drainQueue()).toBe(1);
    expect((await db.book.findUniqueOrThrow({ where: { id: res.bookId } })).status).toBe("ready");
  });

  it("deletes a child and everything about them", async () => {
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const somePage = await db.page.findFirstOrThrow({ where: { bookId: res.bookId, kind: "story" } });

    const out = await deleteChildEverything(userId, child.id);
    expect(out.ok).toBe(true);
    expect(await db.childProfile.count()).toBe(0);
    expect(await db.book.count()).toBe(0);
    expect(await db.page.count()).toBe(0);
    expect(await db.generationJob.count()).toBe(0);
    expect(await getStorage().exists(somePage.imageKey!)).toBe(false);
    expect(await getStorage().deletePrefix(keys.childPrefix(userId, child.id))).toBe(0);
  });

  it("never shows another parent's child", async () => {
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const other = await makeUser("other@example.com");
    expect((await createAndStartBook(other.id, { childId: child.id, themeId, options })).ok).toBe(false);
    expect((await deleteChildEverything(other.id, child.id)).ok).toBe(false);
  });
});
