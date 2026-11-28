/**
 * Overnight pictures: every picture of a book goes to the image service's batch
 * queue in one request (about half price, done within a day). When the batch
 * finishes, each picture is handed to the normal picture job, which checks it,
 * enlarges it for print and saves it, without drawing it again.
 * Anything the batch couldn't draw falls back to a normal (full-price) picture.
 */
import type { Book, GenerationJob, Prisma } from "@prisma/client";
import { db } from "../../db";
import { getConfig } from "../../config";
import { log } from "../../log";
import { enqueue } from "../queue";
import { getImageProvider } from "../../providers/registry";
import { supportsBatch, type BatchItem } from "../../providers/image/types";
import { PermanentProviderError, type Usage } from "../../providers/types";
import { getStorage, keys } from "../../storage";
import { coverArtArgs, pageArtArgs, prepareIllustration } from "./illustrate";
import type { JobOutcome } from "../types";

/** Batches that haven't finished after this long are treated as expired (Gemini's target is 24 hours). */
export const BATCH_GIVE_UP_HOURS = 30;

const COVER_KEY = "cover";

interface PollPayload {
  names: string[];
  keys: string[];
  startedAt: string;
}

async function loadBook(job: GenerationJob) {
  const book = job.bookId ? await db.book.findUnique({ where: { id: job.bookId } }) : null;
  if (!book) throw new PermanentProviderError("Book no longer exists");
  return book;
}

/** Full-price pictures for the given keys (page ids or "cover"), e.g. when the batch didn't draw them. */
async function queueSingles(book: Book, pictureKeys: string[], tx: Prisma.TransactionClient = db) {
  for (const k of pictureKeys) {
    if (k === COVER_KEY) await enqueue("book.cover", {}, { userId: book.userId, bookId: book.id }, tx);
    else await enqueue("page.illustrate", { pageId: k }, { userId: book.userId, bookId: book.id, pageId: k }, tx);
  }
}

async function waitingKeys(book: Book) {
  const pages = await db.page.findMany({ where: { bookId: book.id, kind: "story", imageStatus: "pending" }, select: { id: true }, orderBy: { index: "asc" } });
  return [...pages.map((p) => p.id), ...(book.coverImageKey ? [] : [COVER_KEY])];
}

/** If the batch can't be sent at all, the book still gets its pictures the normal way. */
export async function batchGaveUp(job: GenerationJob) {
  const book = job.bookId ? await db.book.findUnique({ where: { id: job.bookId } }) : null;
  if (!book) return;
  const pending = job.type === "book.batch.poll" ? (job.payload as unknown as PollPayload).keys : await waitingKeys(book);
  await queueSingles(book, pending);
}

export async function batchHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = await loadBook(job);
  const provider = getImageProvider();
  const pictureKeys = await waitingKeys(book);
  if (!pictureKeys.length) return { result: { pictures: 0 } };
  if (!supportsBatch(provider)) {
    await queueSingles(book, pictureKeys);
    return { result: { pictures: pictureKeys.length, fallback: "provider has no batch mode" } };
  }

  const items: BatchItem[] = [];
  for (const k of pictureKeys) {
    const args = k === COVER_KEY ? await coverArtArgs(book) : await pageArtArgs(await db.page.findUniqueOrThrow({ where: { id: k }, include: { book: true } }));
    items.push({ key: k, req: (await prepareIllustration(args)).request() });
  }

  let names: string[];
  try {
    names = await provider.submitIllustrationBatch(items, `StoryStar ${book.title ?? book.id}`);
  } catch (err) {
    if (!(err as { permanent?: boolean }).permanent) throw err;
    // The batch service refused (for example, the model has no batch mode): draw them now instead.
    log.warn("Overnight batch refused; drawing pictures now instead", { bookId: book.id, err: String(err) });
    await queueSingles(book, pictureKeys);
    return { result: { pictures: pictureKeys.length, fallback: String(err).slice(0, 200) } };
  }
  const payload: PollPayload = { names, keys: pictureKeys, startedAt: new Date().toISOString() };
  await enqueue("book.batch.poll", payload as unknown as Prisma.InputJsonValue, {
    userId: book.userId,
    bookId: book.id,
    runAfter: new Date(Date.now() + getConfig().BATCH_POLL_SECONDS * 1000),
  });
  return { result: { pictures: pictureKeys.length, batches: names } };
}

export async function batchPollHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = await loadBook(job);
  const payload = job.payload as unknown as PollPayload;
  const provider = getImageProvider();
  if (!supportsBatch(provider)) {
    await queueSingles(book, payload.keys);
    return { result: { fallback: "provider has no batch mode" } };
  }
  const statuses = await Promise.all(payload.names.map((n) => provider.getIllustrationBatch(n)));
  const unfinished = statuses.some((s) => s.state === "pending" || s.state === "running");
  const tooOld = Date.now() - new Date(payload.startedAt).getTime() > BATCH_GIVE_UP_HOURS * 3600_000;
  if (unfinished && !tooOld) {
    // Check again later. Each check is its own short job, so workers are never tied up waiting.
    await enqueue("book.batch.poll", payload as unknown as Prisma.InputJsonValue, {
      userId: book.userId,
      bookId: book.id,
      runAfter: new Date(Date.now() + Math.max(getConfig().BATCH_POLL_SECONDS, 0) * 1000),
    });
    return { result: { waiting: statuses.map((s) => s.state) } };
  }

  const storage = getStorage();
  const drawn = new Set<string>();
  const ready: Array<{ key: string; storageKey: string; usage: Usage }> = [];
  for (const s of statuses) {
    if (s.state !== "succeeded") continue;
    for (const r of s.results ?? []) {
      if (!r.image || !payload.keys.includes(r.key) || drawn.has(r.key)) continue;
      const ext = r.image.value.mimeType === "image/png" ? "png" : r.image.value.mimeType === "image/svg+xml" ? "svg" : "jpg";
      const storageKey = `${keys.bookPrefix(book.userId, book.childId, book.id)}batch/${job.id}-${r.key}.${ext}`;
      await storage.put(storageKey, r.image.value.data, r.image.value.mimeType);
      ready.push({ key: r.key, storageKey, usage: r.image.usage });
      drawn.add(r.key);
    }
  }
  const missing = payload.keys.filter((k) => !drawn.has(k));
  await db.$transaction(async (tx) => {
    for (const r of ready) {
      const p = { predrawnKey: r.storageKey, predrawnUsage: r.usage } as unknown as Prisma.InputJsonValue;
      if (r.key === COVER_KEY) await enqueue("book.cover", p, { userId: book.userId, bookId: book.id }, tx);
      else await enqueue("page.illustrate", { ...(p as object), pageId: r.key }, { userId: book.userId, bookId: book.id, pageId: r.key }, tx);
    }
    await queueSingles(book, missing, tx);
  });
  if (missing.length) log.warn("Overnight batch missed some pictures; drawing them now", { bookId: book.id, missing: missing.length, states: statuses.map((s) => s.state) });
  return { result: { drawn: ready.length, redrawnNow: missing.length, states: statuses.map((s) => s.state) } };
}

/**
 * Stops overnight batches still waiting at the image provider for the matching jobs, and
 * deletes them there (their book or whole account is being deleted). Best effort: a failure
 * is logged and never blocks the delete.
 */
export async function cancelProviderBatches(where: Prisma.GenerationJobWhereInput) {
  const polls = await db.generationJob.findMany({ where: { AND: [where, { type: "book.batch.poll", status: { in: ["queued", "running"] } }] }, select: { payload: true } });
  const names = [...new Set(polls.flatMap((j) => (j.payload as { names?: string[] } | null)?.names ?? []))];
  if (!names.length) return 0;
  const provider = getImageProvider();
  if (!supportsBatch(provider) || !provider.cancelIllustrationBatch) return 0;
  let cancelled = 0;
  for (const name of names) {
    try {
      await provider.cancelIllustrationBatch(name);
      cancelled++;
    } catch (err) {
      log.warn("Couldn't cancel an overnight batch", { name, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return cancelled;
}
