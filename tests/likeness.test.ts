import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import {
  addPhoto,
  approveSheetOption,
  startCharacterSheet,
} from "@/lib/characters/service";
import { createAndStartBook } from "@/lib/books/service";
import { drainQueue } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { resetProviders } from "@/lib/providers/registry";
import { resetConfigCache } from "@/lib/config";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { MockUpscaler } from "@/lib/providers/upscale/mock";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { MockModerationProvider } from "@/lib/providers/moderation/mock";
import type {
  IllustrationRequest,
  ImageProvider,
} from "@/lib/providers/image/types";
import type {
  PageCheckInput,
  VisionProvider,
} from "@/lib/providers/vision/types";
import type { ImageData } from "@/lib/providers/types";
import { makeUser, resetDb } from "./helpers";

const png = async (
  w: number,
  h: number,
  color = "#ccddee",
): Promise<ImageData> => ({
  data: await sharp({
    create: { width: w, height: h, channels: 3, background: color },
  })
    .png()
    .toBuffer(),
  mimeType: "image/png",
  width: w,
  height: h,
});

function fakeImage() {
  const calls = {
    sheet: 0,
    illustrate: 0,
    edit: 0,
    refs: [] as Array<ImageData | null>,
    reqs: [] as IllustrationRequest[],
  };
  const p: ImageProvider = {
    name: "fake",
    model: "fake-image",
    async generateCharacterSheet(input) {
      calls.sheet++;
      return {
        value: await Promise.all(
          Array.from({ length: input.count }, (_, i) =>
            png(300, 200, ["#ff0000", "#00ff00", "#0000ff"][i % 3]),
          ),
        ),
        usage: { provider: "fake", costUsd: 0.1 },
      };
    },
    async generateIllustration(req) {
      calls.illustrate++;
      calls.refs.push(req.characterRef);
      calls.reqs.push(req);
      return {
        value: await png(256, Math.round(256 / req.aspect)),
        usage: { provider: "fake", costUsd: 0.05 },
      };
    },
    async editIllustration() {
      calls.edit++;
      return {
        value: await png(256, 256, "#123456"),
        usage: { provider: "fake", costUsd: 0.05 },
      };
    },
  };
  return { p, calls };
}

function fakeVision(scores: () => number, storyScores?: () => number) {
  let compares = 0;
  const inputs: PageCheckInput[] = [];
  const v: VisionProvider = {
    name: "fake",
    model: "fake-vision",
    async checkPhoto() {
      return {
        value: { faces: 1, ok: true, problems: [] },
        usage: { provider: "fake", costUsd: 0.01 },
      };
    },
    async checkPage(input) {
      compares++;
      inputs.push(input);
      const score = scores();
      const story = storyScores ? storyScores() : 1;
      return {
        value: {
          likeness: input.sheet
            ? {
                score,
                issues: score >= 0.7 ? [] : ["hair is blond instead of brown"],
              }
            : null,
          story: {
            score: story,
            missing:
              story >= 0.7 ? [] : ["the hat should be on the Mayor's head"],
          },
          ok: (!input.sheet || score >= 0.7) && story >= 0.7,
        },
        usage: { provider: "fake", costUsd: 0.01 },
      };
    },
  };
  return { v, count: () => compares, inputs };
}

const childInput = {
  firstName: "Theodore",
  nickname: "Teddy",
  age: 5,
  pronouns: "he",
  favorites: {
    colors: ["green"],
    animals: ["otters"],
    foods: ["pancakes"],
    activities: ["building forts"],
  },
  friends: [],
};
const options = {
  length: 12,
  readingLevel: "4-6",
  style: "crayon",
  trimSize: "square-8.5",
  includePet: false,
  includeFriend: false,
};

async function photo() {
  return sharp({
    create: { width: 800, height: 1000, channels: 3, background: "#d0b090" },
  })
    .jpeg()
    .toBuffer();
}

describe("character likeness pipeline", () => {
  let userId: string;
  let themeId: string;
  beforeEach(async () => {
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    themeId = (await listThemesForUser(userId)).find(
      (t) => t.slug === "construction-crew",
    )!.id;
  });
  afterEach(() => {
    resetProviders();
    for (const k of ["IMAGE_PROVIDER", "GEMINI_API_KEY"]) delete process.env[k];
    resetConfigCache();
  });

  async function approvedCharacter(
    image: ImageProvider,
    vision: VisionProvider,
  ) {
    resetProviders({
      image,
      vision,
      upscaler: new MockUpscaler(),
      story: new MockStoryProvider(),
      moderation: new MockModerationProvider(),
    });
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    expect((await addPhoto(userId, child.id, await photo(), false)).ok).toBe(
      false,
    ); // consent required
    const added = await addPhoto(userId, child.id, await photo(), true);
    expect(added.ok).toBe(true);
    const start = await startCharacterSheet(userId, child.id, {
      style: "crayon",
    });
    if (!start.ok) throw new Error(start.message);
    await drainQueue();
    const sheet = await db.characterSheet.findUniqueOrThrow({
      where: { id: start.sheetId },
    });
    expect(sheet.status).toBe("draft");
    // One drawing per try (CHARACTER_SHEET_OPTIONS defaults to 1).
    expect((sheet.imageKeys as string[]).length).toBe(1);
    const ok = await approveSheetOption(userId, sheet.id, 0);
    expect(ok).toMatchObject({ ok: true, deletedPhotos: 1 });
    await drainQueue();
    return { childId: child.id, sheetId: sheet.id };
  }

  it("photos -> 3 options -> approve -> bible; originals deleted, unchosen options removed", async () => {
    const img = fakeImage();
    const { childId, sheetId } = await approvedCharacter(
      img.p,
      fakeVision(() => 1).v,
    );
    const sheet = await db.characterSheet.findUniqueOrThrow({
      where: { id: sheetId },
    });
    expect(sheet.status).toBe("approved");
    expect(sheet.bibleStatus).toBe("ready");
    expect(await db.childPhoto.count({ where: { childId } })).toBe(0);
    const keys = sheet.imageKeys as string[];
    expect(await getStorage().exists(keys[1])).toBe(true);
    expect(await getStorage().exists(keys[0])).toBe(false);
    expect(
      (await db.childProfile.findUniqueOrThrow({ where: { id: childId } }))
        .activeCharacterSheetId,
    ).toBe(sheetId);
  });

  it("caps character rounds per style", async () => {
    process.env.CHARACTER_SHEET_MAX_ROUNDS = "1";
    resetConfigCache();
    try {
      const { childId } = await approvedCharacter(
        fakeImage().p,
        fakeVision(() => 1).v,
      );
      const again = await startCharacterSheet(userId, childId, {
        style: "crayon",
      });
      expect(again.ok).toBe(false);
    } finally {
      delete process.env.CHARACTER_SHEET_MAX_ROUNDS;
      resetConfigCache();
    }
  });

  it("every page is drawn from the approved sheet, never the photos, and checked", async () => {
    const img = fakeImage();
    const vis = fakeVision(() => 0.9);
    const { childId, sheetId } = await approvedCharacter(img.p, vis.v);
    const res = await createAndStartBook(userId, { childId, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const book = await db.book.findUniqueOrThrow({
      where: { id: res.bookId },
      include: { pages: true },
    });
    expect(book.characterSheetId).toBe(sheetId);
    expect(book.status).toBe("ready");
    const story = book.pages.filter((p) => p.kind === "story");
    expect(
      story.every((p) => p.imageStatus === "ready" && p.qaScore === 0.9),
    ).toBe(true);
    // 12 pages + cover, each with the sheet as reference (the sheet is a 300x200 PNG, not a photo).
    expect(img.calls.illustrate).toBe(13);
    expect(
      img.calls.refs.every((r) => r && r.width === 300 && r.height === 200),
    ).toBe(true);
    expect(vis.count()).toBe(13);
  });

  it("drift: retries once with the specific fix, then flags the page for the parent", async () => {
    const img = fakeImage();
    const vis = fakeVision(() => 0.3);
    const { childId } = await approvedCharacter(img.p, vis.v);
    const res = await createAndStartBook(userId, {
      childId,
      themeId,
      options: { ...options, length: 12 },
    });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const pages = await db.page.findMany({
      where: { bookId: res.bookId, kind: "story" },
    });
    expect(pages.every((p) => p.imageStatus === "flagged")).toBe(true);
    expect(pages[0].qaIssues).toEqual([
      "Likeness: hair is blond instead of brown",
    ]);
    expect(img.calls.illustrate).toBe(26); // one retry per picture (12 pages + cover)
    expect(
      (await db.book.findUniqueOrThrow({ where: { id: res.bookId } })).status,
    ).toBe("ready");
  });

  it("drift fixed on retry: page is ready with the better score", async () => {
    let n = 0;
    const vis = fakeVision(() => (n++ % 2 === 0 ? 0.4 : 0.85));
    const img = fakeImage();
    const { childId } = await approvedCharacter(img.p, vis.v);
    const res = await createAndStartBook(userId, { childId, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const pages = await db.page.findMany({
      where: { bookId: res.bookId, kind: "story" },
    });
    expect(
      pages.every((p) => p.imageStatus === "ready" && p.qaScore === 0.85),
    ).toBe(true);
  });

  it("pictures get the whole-story context, and a picture that contradicts its words is redrawn with the fix, then flagged", async () => {
    const img = fakeImage();
    const vis = fakeVision(
      () => 0.9,
      () => 0.3,
    );
    const { childId } = await approvedCharacter(img.p, vis.v);
    const res = await createAndStartBook(userId, { childId, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const pages = await db.page.findMany({
      where: { bookId: res.bookId, kind: "story" },
      orderBy: { index: "asc" },
    });
    expect(pages.every((p) => p.imageStatus === "flagged")).toBe(true);
    expect(pages[0].qaIssues).toEqual([
      "Story: the hat should be on the Mayor's head",
    ]);
    expect(img.calls.illustrate).toBe(26);
    // Every page request carries the summary and its own words; middle pages know their neighbors.
    const pageReqs = img.calls.reqs.filter((r) => r.label.startsWith("Page"));
    expect(
      pageReqs.every(
        (r) =>
          r.story && r.story.summary.length > 0 && r.story.pageText.length > 0,
      ),
    ).toBe(true);
    expect(
      pageReqs.some((r) => r.story?.previousMoment && r.story?.nextMoment),
    ).toBe(true);
    // The redraw names what was missing.
    expect(
      pageReqs.some(
        (r) =>
          r.note?.includes("must match the words on the page") &&
          r.note.includes("the hat should be on the Mayor's head"),
      ),
    ).toBe(true);
    // The vision check sees the words and the must-show list.
    expect(
      vis.inputs.some((i) => i.pageText.length > 0 && i.mustShow.length > 0),
    ).toBe(true);
  });

  it("with a real image provider, a book needs an approved character in its style", async () => {
    process.env.IMAGE_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key-not-used";
    resetConfigCache();
    resetProviders();
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, {
      childId: child.id,
      themeId,
      options,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/character/);
  });
  it("a broken picture check never causes redraws: the picture is kept and marked unchecked", async () => {
    const img = fakeImage();
    const vis = fakeVision(() => 1);
    const { childId } = await approvedCharacter(img.p, vis.v);
    vis.v.checkPage = async () => {
      throw new Error("vision outage");
    };
    const res = await createAndStartBook(userId, { childId, themeId, options });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    const pages = await db.page.findMany({
      where: { bookId: res.bookId, kind: "story" },
    });
    expect(pages.every((p) => p.imageStatus === "ready")).toBe(true);
    expect(pages[0].qaIssues).toEqual([
      "Not checked: the picture check was unavailable",
    ]);
    expect(img.calls.illustrate).toBe(13); // exactly one picture per page + cover
    const jobs = await db.generationJob.findMany({
      where: { bookId: res.bookId, type: "page.illustrate" },
    });
    expect(
      jobs.every(
        (j) =>
          j.attempts === 1 &&
          (j.usage as { imageCalls: number }).imageCalls === 1,
      ),
    ).toBe(true);
  });

  it("failed tries are billed and capped: a picture is never drawn more than MAX_DRAWS_PER_PICTURE times", async () => {
    process.env.MAX_DRAWS_PER_PICTURE = "3";
    resetConfigCache();
    try {
      const img = fakeImage();
      const vis = fakeVision(() => 0.3);
      const { childId } = await approvedCharacter(img.p, vis.v);
      // Draws fine, but the upscale step always fails afterwards (a retryable error).
      resetProviders({
        image: img.p,
        vision: vis.v,
        story: new MockStoryProvider(),
        moderation: new MockModerationProvider(),
        upscaler: {
          name: "broken",
          async upscale() {
            throw new Error("upscaler flaked");
          },
        } as never,
      });
      const res = await createAndStartBook(userId, {
        childId,
        themeId,
        options,
      });
      if (!res.ok) throw new Error(res.message);
      // Let backoff pass between tries.
      for (let i = 0; i < 6; i++) {
        await drainQueue();
        await db.generationJob.updateMany({
          where: { status: "queued" },
          data: { runAfter: new Date(0) },
        });
      }
      const jobs = await db.generationJob.findMany({
        where: { bookId: res.bookId, type: "page.illustrate" },
      });
      expect(jobs.length).toBe(12);
      for (const j of jobs) {
        expect(j.status).toBe("failed");
        expect((j.usage as { imageCalls: number }).imageCalls).toBe(3);
        expect(j.costUsd).toBeCloseTo(3 * 0.05 + 3 * 0.01, 5); // every drawn picture and check is on record
      }
      expect(img.calls.illustrate).toBe(13 * 3);
      expect(
        jobs.some((j) => /already drawn 3 times/.test(j.error ?? "")),
      ).toBe(true);
    } finally {
      delete process.env.MAX_DRAWS_PER_PICTURE;
      resetConfigCache();
    }
  });
});
