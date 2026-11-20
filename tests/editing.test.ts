import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { drainQueue } from "@/lib/jobs/runner";
import { acceptFlagged, changeLayout, listVersions, movePage, requestNewArt, restoreVersion, reviseTextWithAI, updatePageText } from "@/lib/books/pages";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { makeUser, resetDb } from "./helpers";

const childInput = { firstName: "Ava", age: 6, pronouns: "she", favorites: { colors: [], animals: ["foxes"], foods: [], activities: ["painting"] }, friends: [] };
const options = { length: 12, readingLevel: "6-8", style: "paper-cutout", trimSize: "square-8.5", includePet: false, includeFriend: false };

describe("single-page editing", () => {
  let userId: string;
  let bookId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "dragon-knight")!.id;
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
    await drainQueue();
  });

  const storyPage = (n: number) => db.page.findFirstOrThrow({ where: { bookId, kind: "story", storyNumber: n } });

  it("edits text with history and restores it", async () => {
    const p = await storyPage(3);
    const before = p.text;
    expect(await updatePageText(userId, p.id, "A brand new line.")).toEqual({ ok: true });
    expect((await storyPage(3)).text).toBe("A brand new line.");
    const versions = await listVersions(userId, p.id);
    expect(versions).toHaveLength(1);
    await restoreVersion(userId, p.id, versions[0].id);
    expect((await storyPage(3)).text).toBe(before);
    expect(await updatePageText(userId, p.id, "   ")).toMatchObject({ ok: false });
    expect(await updatePageText(userId, p.id, "Spider-Man swings by")).toMatchObject({ ok: false });
  });

  it("rewrites text with the story provider and records the cost", async () => {
    const p = await storyPage(2);
    const r = await reviseTextWithAI(userId, p.id, "make it shorter");
    expect(r.ok).toBe(true);
    expect((await storyPage(2)).text).toContain("Revised");
    expect(await db.generationJob.count({ where: { pageId: p.id, type: "page.revise" } })).toBe(1);
  });

  it("redraws or edits only one page, keeping the old picture in history", async () => {
    const p = await storyPage(5);
    const others = await db.page.findMany({ where: { bookId, kind: "story", NOT: { id: p.id } }, select: { id: true, imageKey: true } });
    const jobsBefore = await db.generationJob.count({ where: { bookId } });

    expect(await requestNewArt(userId, p.id, "edit", "make her smile")).toEqual({ ok: true });
    expect(await requestNewArt(userId, p.id, "redraw")).toMatchObject({ ok: false }); // already in progress
    expect(await drainQueue()).toBe(1);
    const edited = await storyPage(5);
    expect(edited.imageStatus).toBe("ready");
    expect(edited.imageKey).not.toBe(p.imageKey);
    expect(edited.version).toBe(2);

    expect(await requestNewArt(userId, p.id, "redraw", "at night")).toEqual({ ok: true });
    expect(await drainQueue()).toBe(1);
    expect(await db.generationJob.count({ where: { bookId } })).toBe(jobsBefore + 2);
    const after = await db.page.findMany({ where: { bookId, kind: "story", NOT: { id: p.id } }, select: { id: true, imageKey: true } });
    expect(after).toEqual(others);

    const versions = await listVersions(userId, p.id);
    const original = versions.find((v) => v.version === 1)!;
    await restoreVersion(userId, p.id, original.id);
    expect((await storyPage(5)).imageKey).toBe(p.imageKey);
    expect(await requestNewArt(userId, p.id, "edit")).toMatchObject({ ok: false }); // needs a note
  });

  it("swaps layout and reorders story pages", async () => {
    const p1 = await storyPage(1);
    const p2 = await storyPage(2);
    expect(await changeLayout(userId, p1.id, "imageTop", "top")).toEqual({ ok: true });
    expect((await db.page.findUniqueOrThrow({ where: { id: p1.id } })).textZone).toBe("bottom");
    expect(await changeLayout(userId, p1.id, "collage", "top")).toMatchObject({ ok: false });
    expect(await movePage(userId, p1.id, "down")).toEqual({ ok: true });
    expect((await db.page.findUniqueOrThrow({ where: { id: p1.id } })).storyNumber).toBe(2);
    expect((await db.page.findUniqueOrThrow({ where: { id: p2.id } })).storyNumber).toBe(1);
    expect(await movePage(userId, p2.id, "up")).toMatchObject({ ok: false });
  });

  it("lets the parent accept a flagged picture", async () => {
    const p = await storyPage(4);
    await db.page.update({ where: { id: p.id }, data: { imageStatus: "flagged" } });
    expect(await acceptFlagged(userId, p.id)).toEqual({ ok: true });
    expect((await storyPage(4)).imageStatus).toBe("ready");
  });

  it("other parents can't edit", async () => {
    const other = await makeUser("other@example.com");
    const p = await storyPage(1);
    expect(await updatePageText(other.id, p.id, "hi")).toMatchObject({ ok: false });
    expect(await requestNewArt(other.id, p.id, "redraw")).toMatchObject({ ok: false });
  });
});
