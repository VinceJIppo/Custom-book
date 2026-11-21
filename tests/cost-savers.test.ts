import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { approveStory } from "@/lib/books/pictures";
import { updatePageText } from "@/lib/books/pages";
import { drainQueue } from "@/lib/jobs/runner";
import { resetProviders } from "@/lib/providers/registry";
import { resetConfigCache } from "@/lib/config";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { MockImageProvider } from "@/lib/providers/image/mock";
import { MockUpscaler } from "@/lib/providers/upscale/mock";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { MockModerationProvider } from "@/lib/providers/moderation/mock";
import { GeminiImageProvider, GEMINI_BASE } from "@/lib/providers/gemini/image";
import { getTrim, illustrationTargetPx } from "@/lib/print/geometry";
import { PermanentProviderError, type ImageData } from "@/lib/providers/types";
import type { BatchItem, BatchResult, BatchState, IllustrationRequest } from "@/lib/providers/image/types";
import type { VisionProvider } from "@/lib/providers/vision/types";
import { makeUser, resetDb } from "./helpers";

const childInput = {
  firstName: "Theodore",
  nickname: "Teddy",
  age: 5,
  pronouns: "he",
  favorites: { colors: ["green"], animals: ["otters"], foods: ["pancakes"], activities: ["building forts"] },
  friends: [],
};
const options = { length: 12, readingLevel: "4-6", style: "bold-comic", trimSize: "square-8.5", includePet: false, includeFriend: false };

function setEnv(vars: Record<string, string>) {
  Object.assign(process.env, vars);
  resetConfigCache();
}

/** Mock pictures, plus a batch queue whose behavior each test controls. */
class FakeBatchImages extends MockImageProvider {
  singles = 0;
  submitted: BatchItem[][] = [];
  polls = 0;
  states: BatchState[] = ["succeeded"];
  failKeys = new Set<string>();
  refuse = false;
  override async generateIllustration(req: IllustrationRequest) {
    this.singles++;
    return super.generateIllustration(req);
  }
  override async submitIllustrationBatch(items: BatchItem[]) {
    if (this.refuse) throw new PermanentProviderError("model has no batch mode");
    this.submitted.push(items);
    return [`batches/fake-${this.submitted.length}`];
  }
  override async getIllustrationBatch(): Promise<{ state: BatchState; results?: BatchResult[] }> {
    const state = this.states[Math.min(this.polls++, this.states.length - 1)];
    if (state !== "succeeded") return { state };
    const results: BatchResult[] = [];
    for (const it of this.submitted.at(-1) ?? []) {
      if (this.failKeys.has(it.key)) results.push({ key: it.key, error: "blocked" });
      else {
        const img = await super.generateIllustration(it.req);
        results.push({ key: it.key, image: { value: img.value, usage: { provider: "fake", costUsd: 0.025, imageCalls: 1 } } });
      }
    }
    return { state, results };
  }
}

function failingVision(): VisionProvider & { checks: number } {
  const v = {
    name: "fake",
    model: "fake-vision",
    checks: 0,
    async checkPhoto() {
      return { value: { faces: 1, ok: true, problems: [] }, usage: { provider: "fake", costUsd: 0 } };
    },
    async checkPage() {
      v.checks++;
      return { value: { likeness: null, story: { score: 0.2, missing: ["the hat"] }, ok: false }, usage: { provider: "fake", costUsd: 0.01 } };
    },
  };
  return v;
}

describe("cost savers", () => {
  let userId: string;
  let themeId: string;
  let childId: string;
  let images: FakeBatchImages;
  beforeEach(async () => {
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    themeId = (await listThemesForUser(userId)).find((t) => t.slug === "superhero-squad")!.id;
    const child = await createChild(userId, childInput);
    if (!child.ok) throw new Error("child");
    childId = child.id;
    images = new FakeBatchImages();
    resetProviders({ image: images, upscaler: new MockUpscaler(), story: new MockStoryProvider(), moderation: new MockModerationProvider() });
    setEnv({ STORY_REVIEW: "true" });
  });
  afterEach(() => {
    setEnv({ STORY_REVIEW: "false", PICTURE_CHECK: "redraw" });
    resetProviders();
  });

  async function newBook(extra: Record<string, unknown> = {}) {
    const res = await createAndStartBook(userId, { childId, themeId, options: { ...options, ...extra } });
    if (!res.ok) throw new Error(res.message);
    await drainQueue();
    return res.bookId;
  }
  const jobsOf = (bookId: string, type: string) => db.generationJob.findMany({ where: { bookId, type } });

  it("stops after the words for the parent to review: no pictures are drawn or paid for", async () => {
    const bookId = await newBook();
    const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
    expect(book.status).toBe("story_review");
    expect(await jobsOf(bookId, "page.illustrate")).toHaveLength(0);
    expect(await jobsOf(bookId, "book.cover")).toHaveLength(0);
    expect(images.singles).toBe(0);

    // Edits during review are free and are what gets drawn.
    const first = book.pages.find((p) => p.storyNumber === 1)!;
    expect((await updatePageText(userId, first.id, "Teddy found a tiny red hat.")).ok).toBe(true);

    const other = await makeUser("other@example.com");
    expect((await approveStory(other.id, bookId)).ok).toBe(false);
    expect(await approveStory(userId, bookId, "now")).toEqual({ ok: true, mode: "now" });
    expect((await approveStory(userId, bookId)).ok).toBe(false); // only once
    await drainQueue();
    const done = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
    expect(done.status).toBe("ready");
    expect(done.pages.find((p) => p.id === first.id)?.text).toBe("Teddy found a tiny red hat.");
    expect(images.singles).toBe(13); // 12 pages + cover, once each
  });

  it("overnight: one batch for every picture, finished by the normal picture step without redrawing", async () => {
    const bookId = await newBook({ pictureSpeed: "overnight" });
    expect(await approveStory(userId, bookId)).toEqual({ ok: true, mode: "overnight" });
    await drainQueue();
    expect(images.submitted).toHaveLength(1);
    expect(images.submitted[0].map((i) => i.key)).toContain("cover");
    expect(images.submitted[0]).toHaveLength(13);
    expect(images.singles).toBe(0);
    const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
    expect(book.status).toBe("ready");
    expect(book.coverImageKey).toBeTruthy();
    expect(book.pages.filter((p) => p.kind === "story").every((p) => p.imageStatus === "ready" && p.imageKey)).toBe(true);
    const pageJobs = await jobsOf(bookId, "page.illustrate");
    expect(pageJobs.every((j) => (j.payload as { predrawnKey?: string }).predrawnKey)).toBe(true);
    // Batch price is recorded on each picture.
    expect(pageJobs.every((j) => Math.abs(j.costUsd - 0.025) < 1e-9)).toBe(true);
  });

  it("overnight: checks back until the batch is done, and draws anything it missed the normal way", async () => {
    images.states = ["pending", "running", "succeeded"];
    const bookId = await newBook({ pictureSpeed: "overnight" });
    const page3 = (await db.page.findFirstOrThrow({ where: { bookId, storyNumber: 3 } })).id;
    images.failKeys.add(page3);
    await approveStory(userId, bookId);
    await drainQueue();
    expect(images.polls).toBe(3);
    expect(await jobsOf(bookId, "book.batch.poll")).toHaveLength(3);
    expect(images.singles).toBe(1); // only page 3, at the normal price
    expect((await db.book.findUniqueOrThrow({ where: { id: bookId } })).status).toBe("ready");
  });

  it("overnight: if the batch service refuses, the pictures are drawn right away instead", async () => {
    images.refuse = true;
    const bookId = await newBook({ pictureSpeed: "overnight" });
    await approveStory(userId, bookId);
    await drainQueue();
    expect(images.singles).toBe(13);
    expect((await db.book.findUniqueOrThrow({ where: { id: bookId } })).status).toBe("ready");
  });

  it("flag mode: a failed picture check keeps the picture and flags it, with no automatic redraw", async () => {
    setEnv({ PICTURE_CHECK: "flag", STORY_REVIEW: "false" });
    // A raster mock so the check runs (SVG mock art is never checked).
    const png = async (req: IllustrationRequest): Promise<ImageData> => {
      images.singles++;
      const w = 200;
      const h = Math.round(200 / req.aspect);
      return { data: await sharp({ create: { width: w, height: h, channels: 3, background: "#abcdef" } }).png().toBuffer(), mimeType: "image/png", width: w, height: h };
    };
    images.generateIllustration = async (req) => ({ value: await png(req), usage: { provider: "fake", costUsd: 0.05, imageCalls: 1 } });
    const vision = failingVision();
    resetProviders({ image: images, vision, upscaler: new MockUpscaler(), story: new MockStoryProvider(), moderation: new MockModerationProvider() });
    const bookId = await newBook();
    const pages = await db.page.findMany({ where: { bookId, kind: "story" } });
    expect(pages.every((p) => p.imageStatus === "flagged")).toBe(true);
    expect(pages[0].qaIssues).toEqual(["Story: the hat"]);
    expect(images.singles).toBe(13);
    expect(vision.checks).toBe(13);
  });
});

describe("Gemini Batch Mode adapter", () => {
  const square = getTrim("square-8.5");
  async function item(key: string, refBytes = 64): Promise<BatchItem> {
    const ref = await sharp({ create: { width: refBytes, height: refBytes, channels: 3, background: "#88aaff" } }).png().toBuffer();
    return {
      key,
      req: {
        characterRef: { data: ref, mimeType: "image/png", width: refBytes, height: refBytes },
        bible: null,
        childName: "Teddy",
        scene: { action: "Teddy waves", characters: ["Teddy"], setting: "a boat", mood: "happy", framing: "wide", mustShow: [], continuity: "" },
        style: "watercolor-storybook",
        aspect: 1,
        targetPx: illustrationTargetPx("fullBleed", square),
        textZone: "top",
        palette: ["#123456"],
        label: key,
      },
    };
  }

  it("sends inlined generateContent requests and prices finished pictures at half", async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    const out = (await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ff0000" } }).jpeg().toBuffer()).toString("base64");
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null });
      if (init.method === "POST") return Response.json({ name: "batches/abc123", metadata: { state: "BATCH_STATE_PENDING" } });
      return Response.json({
        name: "batches/abc123",
        done: true,
        metadata: {
          state: "BATCH_STATE_SUCCEEDED",
          output: {
            inlinedResponses: {
              inlinedResponses: [
                { metadata: { key: "p1", size: "2K", refs: "1" }, response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: "eA==" }, thought: true }, { inlineData: { mimeType: "image/jpeg", data: out } }] } }] } },
                { metadata: { key: "p2", size: "2K", refs: "1" }, error: { message: "Blocked for safety" } },
              ],
            },
          },
        },
      });
    }) as unknown as typeof fetch;
    const g = new GeminiImageProvider({ apiKey: "k", model: "gemini-nano-banana-2.1", pageSize: "2K", fetchImpl });
    const names = await g.submitIllustrationBatch([await item("p1"), await item("p2")], "Teddy's book");
    expect(names).toEqual(["batches/abc123"]);
    expect(calls[0].url).toBe(`${GEMINI_BASE}/models/gemini-nano-banana-2.1:batchGenerateContent`);
    const batch = calls[0].body!.batch as { displayName: string; inputConfig: { requests: { requests: Array<{ request: { contents: Array<{ parts: unknown[] }>; generationConfig: unknown }; metadata: unknown }> } } };
    expect(batch.displayName).toBe("Teddy's book");
    const first = batch.inputConfig.requests.requests[0];
    expect(first.metadata).toEqual({ key: "p1", size: "2K", refs: "1" });
    expect(first.request.generationConfig).toEqual({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "2K" } });
    expect(first.request.contents[0].parts[1]).toMatchObject({ inlineData: { mimeType: "image/png" } });

    const status = await g.getIllustrationBatch("batches/abc123");
    expect(calls[1]).toMatchObject({ url: `${GEMINI_BASE}/batches/abc123`, method: "GET" });
    expect(status.state).toBe("succeeded");
    const [ok, bad] = status.results!;
    expect(ok.key).toBe("p1");
    expect(ok.image?.value.width).toBe(32); // the thought image is skipped
    expect(ok.image?.usage.costUsd).toBeCloseTo((0.0504 + 0.0017) / 2, 6);
    expect(bad).toEqual({ key: "p2", error: "Blocked for safety" });
    await expect(g.getIllustrationBatch("../files/x")).rejects.toThrow(/Not a batch name/);
  });

  it("reports unfinished batches and splits requests that would pass the size limit", async () => {
    const posts: number[] = [];
    let n = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      if (init.method === "POST") {
        posts.push(String(init.body).length);
        return Response.json({ name: `batches/b${++n}` });
      }
      return Response.json({ name: "batches/b1", metadata: { state: "BATCH_STATE_RUNNING" } });
    }) as unknown as typeof fetch;
    const g = new GeminiImageProvider({ apiKey: "k", model: "m", pageSize: "1K", fetchImpl });
    expect(await g.getIllustrationBatch("batches/b1")).toEqual({ state: "running" });
    const items = await Promise.all(["a", "b", "c", "d", "e", "f"].map((k) => item(k)));
    const one = JSON.stringify(g.buildBatchRequest(items[0])).length;
    const small = new GeminiImageProvider({ apiKey: "k", model: "m", pageSize: "1K", fetchImpl, batchMaxBytes: one * 2 + 10 });
    const names = await small.submitIllustrationBatch(items, "big");
    expect(names).toHaveLength(3); // two requests per batch
    expect(posts.every((b) => b < one * 2 + 500)).toBe(true);
  });
});
