import { creditProblem } from "../credits";
import { IMAGE_PRICES, PLANNING_IMAGE_PRICE } from "../cost/prices";
import { imageProviderChoice } from "../providers/registry";
import type { Book, Prisma } from "@prisma/client";
import { db } from "../db";
import { enqueue } from "../jobs/queue";
import { PictureSpeedSchema, type PictureSpeed } from "../schemas/book";
import { plansAreStale } from "./review";

/** The picture speed chosen for a book (older books, and anything unknown, read as "now"). */
export function pictureSpeedOf(book: Pick<Book, "options">): PictureSpeed {
  const parsed = PictureSpeedSchema.safeParse((book.options as { pictureSpeed?: unknown } | null)?.pictureSpeed);
  return parsed.success ? parsed.data : "now";
}

/**
 * Queues the pictures for every story page still waiting for one, plus the cover.
 * "now" draws each picture as its own job; "overnight" sends them all to the
 * image service's batch queue in one go (about half price, ready within a day).
 */
export async function queuePictures(book: Pick<Book, "id" | "userId" | "options" | "coverImageKey">, tx: Prisma.TransactionClient = db) {
  const pages = await tx.page.findMany({ where: { bookId: book.id, kind: "story", imageStatus: "pending" }, select: { id: true }, orderBy: { index: "asc" } });
  if (pictureSpeedOf(book) === "overnight") {
    await enqueue("book.batch", {}, { userId: book.userId, bookId: book.id }, tx);
    return { pages: pages.length, mode: "overnight" as const };
  }
  for (const p of pages) await enqueue("page.illustrate", { pageId: p.id }, { userId: book.userId, bookId: book.id, pageId: p.id }, tx);
  if (!book.coverImageKey) await enqueue("book.cover", {}, { userId: book.userId, bookId: book.id }, tx);
  return { pages: pages.length, mode: "now" as const };
}

export type ApproveResult = { ok: true; mode: PictureSpeed } | { ok: false; message: string };

/** The parent has read the story: start the pictures, at the speed they picked. */
export async function approveStory(userId: string, bookId: string, speed?: string): Promise<ApproveResult> {
  const book = await db.book.findFirst({ where: { id: bookId, userId } });
  if (!book) return { ok: false, message: "Book not found." };
  if (book.status !== "story_review") return { ok: false, message: "The pictures for this story have already been started." };
  const chosen = PictureSpeedSchema.safeParse(speed);
  // Enough credits for the pictures (overnight is about half price).
  const pictures = (await db.page.count({ where: { bookId: book.id, kind: "story" } })) + 1;
  const each = (IMAGE_PRICES[imageProviderChoice()] ?? PLANNING_IMAGE_PRICE).perIllustration;
  const credit = await creditProblem(userId, pictures * each * ((chosen.success ? chosen.data : pictureSpeedOf(book)) === "overnight" ? 0.5 : 1));
  if (credit) return { ok: false, message: credit };
  const options = { ...(book.options as object), ...(chosen.success ? { pictureSpeed: chosen.data } : {}) };
  return db.$transaction(async (tx) => {
    // Only one approval wins, even if the button is pressed twice.
    const claimed = await tx.book.updateMany({
      where: { id: book.id, status: "story_review" },
      data: { status: "generating", options: options as Prisma.InputJsonValue },
    });
    if (claimed.count !== 1) return { ok: false as const, message: "The pictures for this story have already been started." };
    const mode = chosen.success ? chosen.data : pictureSpeedOf(book);
    // Words changed since the picture plans were made: refresh the plans first (that job starts the pictures).
    const pages = await tx.page.findMany({ where: { bookId: book.id }, select: { storyNumber: true, text: true, kind: true } });
    if (plansAreStale(book, pages)) {
      await enqueue("book.artdirect", {}, { userId: book.userId, bookId: book.id }, tx);
      return { ok: true as const, mode };
    }
    const queued = await queuePictures({ ...book, options: options as Prisma.JsonValue }, tx);
    return { ok: true as const, mode: queued.mode };
  });
}
