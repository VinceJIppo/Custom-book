/**
 * Print export: render interior + cover PDFs for one product, run preflight,
 * store the files, and (on request) have the print provider validate them.
 */
import type { BookExport } from "@prisma/client";
import { db } from "../db";
import { enqueue } from "../jobs/queue";
import { getPrintRouter } from "../providers/registry";
import type { ProductSpec } from "../providers/print/types";
import { buildBookView } from "./view";
import type { PreflightReport } from "../print/preflight";

export type ExportResult = { ok: true; exportId: string } | { ok: false; message: string };

/** Bindings parents can order. Softcover stays in the catalog (and for admins) but isn't offered. */
export const OFFERED_BINDINGS: readonly string[] = ["hardcover"];

/** Products for a book's size. offeredOnly: only what parents can order (hardcover). */
export async function productsForBook(trimSize: string, opts: { offeredOnly?: boolean } = {}): Promise<ProductSpec[]> {
  const router = getPrintRouter();
  const all: ProductSpec[] = [];
  for (const p of await router.allProducts()) if (p.trimSize === trimSize && (!opts.offeredOnly || OFFERED_BINDINGS.includes(p.binding))) all.push(p);
  return all;
}

export type PrintFilesState = { state: "ready" } | { state: "making"; since: Date } | { state: "failed"; message: string };

/**
 * Parents never make print files themselves: when a book is finished (and again
 * whenever it changes), this makes the hardcover files in the background. The
 * print checks fix what they can on their own.
 */
export async function ensurePrintFiles(userId: string, bookId: string): Promise<PrintFilesState> {
  const book = await db.book.findFirst({ where: { id: bookId, userId }, include: { pages: true } });
  if (!book || book.status !== "ready" || !book.pages.length) return { state: "failed", message: "The book isn't finished yet." };
  const product = (await productsForBook(book.trimSize, { offeredOnly: true }))[0];
  if (!product) return { state: "failed", message: "This book's size can't be printed as a hardcover." };
  const currentKey = (await buildBookView(book, { pageRules: product.pageRules })).contentKey;
  let exports = await db.bookExport.findMany({ where: { bookId, productId: product.id }, orderBy: { createdAt: "desc" }, take: 5 });
  const rendering = exports.find((e) => e.status === "rendering");
  if (rendering) {
    // Only "being made" while a job is actually on it. If the worker stopped and the job is
    // gone or failed, this try failed: mark it so, and start again below (at most twice).
    const live = await db.generationJob.count({ where: { bookId, type: "book.export", status: { in: ["queued", "running"] } } });
    if (live) return { state: "making", since: rendering.createdAt };
    await db.bookExport.updateMany({ where: { id: rendering.id, status: "rendering" }, data: { status: "failed", error: "Making the print files stopped before it finished." } });
    exports = await db.bookExport.findMany({ where: { bookId, productId: product.id }, orderBy: { createdAt: "desc" }, take: 5 });
  }
  const current = exports.find((e) => e.contentKey === currentKey);
  if (current?.status === "ready" && current.preflightOk && current.validationStatus !== "failed") return { state: "ready" };
  if (current?.status === "ready" && !current.preflightOk) return { state: "failed", message: "A page still needs a fix before it can print. Open Edit pages, or ask us for help." };
  // The latest try for this version failed: try once more, then ask for help.
  const failedTries = exports.filter((e) => e.contentKey === currentKey && e.status === "failed").length;
  if (failedTries >= 2) return { state: "failed", message: current?.error ?? "We couldn't prepare the book for printing. Please try again later." };
  const started = await startExport(userId, bookId, product.id);
  return started.ok ? { state: "making", since: new Date() } : { state: "failed", message: started.message };
}

export async function startExport(userId: string, bookId: string, productId: string): Promise<ExportResult> {
  const book = await db.book.findFirst({ where: { id: bookId, userId }, include: { pages: true } });
  if (!book) return { ok: false, message: "Book not found." };
  if (book.status !== "ready") return { ok: false, message: "Finish the book first: it is still being made." };
  if (book.pages.some((p) => p.imageStatus === "pending")) return { ok: false, message: "A picture is still being drawn. Try again when it's done." };
  const product = (await productsForBook(book.trimSize)).find((p) => p.id === productId);
  if (!product) return { ok: false, message: "That product isn't available for this book's size." };
  if (await db.bookExport.count({ where: { bookId, status: "rendering" } })) return { ok: false, message: "Print files are already being made." };

  const view = await buildBookView(book, { pageRules: product.pageRules });
  const exp = await db.$transaction(async (tx) => {
    const e = await tx.bookExport.create({
      data: { bookId, userId, productId: product.id, provider: product.provider, sku: product.sku, status: "rendering", contentKey: view.contentKey },
    });
    await enqueue("book.export", { exportId: e.id }, { userId, bookId, maxAttempts: 2 }, tx);
    return e;
  });
  return { ok: true, exportId: exp.id };
}

export async function startValidation(userId: string, exportId: string): Promise<ExportResult> {
  const exp = await db.bookExport.findFirst({ where: { id: exportId, userId } });
  if (!exp || exp.status !== "ready") return { ok: false, message: "Make the print files first." };
  if (!exp.preflightOk) return { ok: false, message: "Fix the preflight errors first; the printer would reject these files." };
  if (exp.validationStatus === "running") return { ok: false, message: "Already checking with the printer." };
  await db.$transaction(async (tx) => {
    await tx.bookExport.update({ where: { id: exp.id }, data: { validationStatus: "running", validationProgress: "Queued", validation: undefined } });
    await enqueue("export.validate", { exportId: exp.id }, { userId, bookId: exp.bookId, maxAttempts: 2 }, tx);
  });
  return { ok: true, exportId: exp.id };
}

export async function listExports(userId: string, bookId: string) {
  return db.bookExport.findMany({ where: { bookId, userId }, orderBy: { createdAt: "desc" }, take: 5 });
}

export function preflightOf(exp: BookExport): PreflightReport | null {
  return (exp.preflight as unknown as PreflightReport | null) ?? null;
}
