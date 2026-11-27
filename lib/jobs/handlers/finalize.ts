import { db } from "../../db";

/** Marks a book ready once no story page is still waiting for art and the cover is done or given up. */
export async function maybeFinalizeBook(bookId: string) {
  const book = await db.book.findUnique({ where: { id: bookId }, select: { status: true, coverImageKey: true } });
  if (!book || book.status !== "generating") return false;
  const pending = await db.page.count({ where: { bookId, kind: "story", imageStatus: "pending" } });
  if (pending > 0) return false;
  if (!book.coverImageKey) {
    const coverActive = await db.generationJob.count({ where: { bookId, type: "book.cover", status: { in: ["queued", "running"] } } });
    // The cover job calls this while still "running", after saving the key, so it never counts itself.
    if (coverActive > 0) return false;
  }
  const res = await db.book.updateMany({ where: { id: bookId, status: "generating" }, data: { status: "ready" } });
  if (res.count === 1) {
    const { notifyBookReady } = await import("../../books/notify");
    await notifyBookReady(bookId);
    // Print files are made in the background so "Order" is ready when the parent is.
    try {
      const { getConfig } = await import("../../config");
      if (!getConfig().AUTO_PRINT_FILES) return true;
      const owner = await db.book.findUnique({ where: { id: bookId }, select: { userId: true } });
      const { ensurePrintFiles } = await import("../../books/export");
      if (owner) await ensurePrintFiles(owner.userId, bookId);
    } catch {
      // Never fail the book over this: the order page tries again.
    }
  }
  return res.count === 1;
}
