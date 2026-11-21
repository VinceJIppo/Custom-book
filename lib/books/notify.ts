/** "Your book is ready" email for overnight books. Best effort: a failed email never breaks a book. */
import { db } from "../db";
import { getConfig } from "../config";
import { getEmailProvider } from "../providers/registry";
import { errorMessage, log } from "../log";
import { pictureSpeedOf } from "./pictures";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function notifyBookReady(bookId: string) {
  try {
    const book = await db.book.findUnique({ where: { id: bookId }, include: { user: true } });
    if (!book || pictureSpeedOf(book) !== "overnight" || book.user.email.endsWith(".local")) return;
    const title = book.title || "Your book";
    const link = `${getConfig().APP_URL.replace(/\/$/, "")}/books/${book.id}`;
    const line = `The pictures for "${title}" are finished. Open it to read it, change any page, or order a printed copy.`;
    await getEmailProvider().send({
      to: book.user.email,
      subject: `Ready to read: ${title}`,
      text: `${line}\n\n${link}`,
      html: `<p>${esc(line)}</p><p><a href="${link}">Open your book</a></p>`,
      idempotencyKey: `book-ready-${book.id}-${book.version}`,
    });
  } catch (err) {
    log.warn("Book ready email failed", { bookId, err: errorMessage(err) });
  }
}
