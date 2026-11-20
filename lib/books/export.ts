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

export async function productsForBook(trimSize: string): Promise<ProductSpec[]> {
  const router = getPrintRouter();
  const all: ProductSpec[] = [];
  for (const p of await router.allProducts()) if (p.trimSize === trimSize) all.push(p);
  return all;
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
