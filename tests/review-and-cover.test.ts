import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { approveStory } from "@/lib/books/pictures";
import { rewritePageRange, rewriteWholeStory, undoRewrite } from "@/lib/books/review";
import { requestNewCover, updatePageText } from "@/lib/books/pages";
import { buildBookView } from "@/lib/books/view";
import { drainQueue } from "@/lib/jobs/runner";
import { resetProviders } from "@/lib/providers/registry";
import { resetConfigCache } from "@/lib/config";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { getStorage } from "@/lib/storage";
import { MockImageProvider } from "@/lib/providers/image/mock";
import { MockUpscaler } from "@/lib/providers/upscale/mock";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { MockModerationProvider } from "@/lib/providers/moderation/mock";
import { buildIllustrationPrompt } from "@/lib/providers/image/prompt";
import type { IllustrationRequest } from "@/lib/providers/image/types";
import type { ArtInputPage } from "@/lib/providers/story/types";
import { makeUser, resetDb } from "./helpers";

const childInput = { firstName: "Charlie", age: 3, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] };
const options = { length: 12, readingLevel: "2-4", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };

class RecordingStory extends MockStoryProvider {
  artCalls: ArtInputPage[][] = [];
  override async directArt(...args: Parameters<MockStoryProvider["directArt"]>) {
    this.artCalls.push(args[1]);
    return super.directArt(...args);
  }
}

describe("changing the story during review", () => {
  let userId: string;
  let bookId: string;
  let story: RecordingStory;
  let images: { reqs: IllustrationRequest[] };
  beforeEach(async () => {
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "superhero-squad")!.id;
    story = new RecordingStory();
    const img = new MockImageProvider();
    images = { reqs: [] };
    const draw = img.generateIllustration.bind(img);
    img.generateIllustration = async (req) => {
      images.reqs.push(req);
      return draw(req);
    };
    resetProviders({ image: img, upscaler: new MockUpscaler(), story, moderation: new MockModerationProvider() });
    process.env.STORY_REVIEW = "true";
    resetConfigCache();
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
    await drainQueue();
  });
  afterEach(() => {
    process.env.STORY_REVIEW = "false";
    resetConfigCache();
    resetProviders();
  });
  const storyPages = () => db.page.findMany({ where: { bookId, kind: "story" }, orderBy: { index: "asc" } });

  it("rewrites only the chosen pages, and Undo puts them back", async () => {
    const before = await storyPages();
    const res = await rewritePageRange(userId, bookId, 3, 5, "make Charlie braver");
    expect(res).toMatchObject({ ok: true, message: "Rewrote pages 3, 4, 5." });
    const after = await storyPages();
    after.forEach((p, i) => {
      if ([3, 4, 5].includes(p.storyNumber!)) expect(p.text).toContain("(Revised: make Charlie braver)");
      else expect(p.text).toBe(before[i].text);
    });
    expect(await db.generationJob.count({ where: { bookId, type: "page.revise" } })).toBe(1); // one AI rewrite used
    if (!res.ok) throw new Error();
    expect((await undoRewrite(userId, bookId, res.undoTag!)).ok).toBe(true);
    expect((await storyPages()).map((p) => p.text)).toEqual(before.map((p) => p.text));
    expect((await undoRewrite(userId, bookId, "../../x")).ok).toBe(false);
  });

  it("starts the whole story over from the parent's notes, then comes back for review", async () => {
    const res = await rewriteWholeStory(userId, bookId, "set it at the beach");
    expect(res.ok).toBe(true);
    expect((await db.book.findUniqueOrThrow({ where: { id: bookId } })).status).toBe("generating");
    await drainQueue();
    const book = await db.book.findUniqueOrThrow({ where: { id: bookId } });
    expect(book.status).toBe("story_review");
    expect((book.options as { storyFeedback?: { note: string } }).storyFeedback?.note).toBe("set it at the beach");
    expect(await storyPages()).toHaveLength(12);
    expect(await db.generationJob.count({ where: { bookId, type: "book.outline" } })).toBe(2);
  });

  it("refreshes the picture plans before drawing when the words changed", async () => {
    const first = (await storyPages())[0];
    await updatePageText(userId, first.id, "Charlie skipped to the stream with a red bucket.");
    await approveStory(userId, bookId);
    await drainQueue();
    expect(story.artCalls).toHaveLength(1);
    expect(story.artCalls[0][0].text).toBe("Charlie skipped to the stream with a red bucket.");
    const page1 = images.reqs.find((r) => r.label === "Page 1")!;
    expect(page1.scene.mustShow[0]).toContain("red bucket");
    expect((await db.book.findUniqueOrThrow({ where: { id: bookId } })).status).toBe("ready");
  });

  it("skips the refresh when nothing changed, and refuses changes once pictures start", async () => {
    await approveStory(userId, bookId);
    await drainQueue();
    expect(story.artCalls).toHaveLength(0);
    expect((await rewritePageRange(userId, bookId, 1, 2, "shorter")).ok).toBe(false);
    expect((await rewriteWholeStory(userId, bookId, "shorter")).ok).toBe(false);
  });

  it("the cover is drawn for the space under the title, and can be redrawn with a note", async () => {
    await approveStory(userId, bookId);
    await drainQueue();
    const cover = images.reqs.find((r) => r.label === "Cover")!;
    // Wider than the page: the picture fills the area below the title band.
    expect(cover.aspect).toBeGreaterThan(1.4);
    expect(cover.textZone).toBeNull();
    expect(cover.scene.mustShow.join(" ")).toMatch(/whole head and face/);
    expect(buildIllustrationPrompt(cover)).toMatch(/never cut through a head or face/);
    let book = await db.book.findUniqueOrThrow({ where: { id: bookId } });
    const oldKey = book.coverImageKey!;
    expect((await buildBookView(await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } }))).cover.fit).toBe("below-title");

    expect((await requestNewCover(userId, bookId, "show Charlie waving by the stream")).ok).toBe(true);
    expect((await requestNewCover(userId, bookId)).ok).toBe(false); // already redrawing
    await drainQueue();
    book = await db.book.findUniqueOrThrow({ where: { id: bookId } });
    expect(book.status).toBe("ready");
    expect(book.coverImageKey).not.toBe(oldKey);
    expect(await getStorage().exists(oldKey)).toBe(false);
    expect(images.reqs.filter((r) => r.label === "Cover").at(-1)!.note).toBe("show Charlie waving by the stream");

    const other = await makeUser("other@example.com");
    expect((await requestNewCover(other.id, bookId)).ok).toBe(false);
  });
});
