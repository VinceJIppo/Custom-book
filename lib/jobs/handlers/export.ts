/**
 * Worker-only export jobs (they load the PDF renderer, which needs
 * react-dom/server and headless Chromium).
 */
import type { GenerationJob, Prisma } from "@prisma/client";
import { db } from "../../db";
import { getConfig } from "../../config";
import { getStorage, keys } from "../../storage";
import { getPrintRouter } from "../../providers/registry";
import { PermanentProviderError } from "../../providers/types";
import { buildBookView } from "../../books/view";
import { planPadding } from "../../print/padding";
import { coverLayout } from "../../print/cover";
import { getTrim } from "../../print/geometry";
import { inspectPdf } from "../../print/pdfInspect";
import { runPreflight } from "../../print/preflight";
import type { JobOutcome } from "../types";
import { isPrivateUrl, publicUrlHelp } from "../../print/publicUrl";

/** The job: render, inspect, preflight, store. */
export async function exportHandler(job: GenerationJob): Promise<JobOutcome> {
  const exportId = (job.payload as { exportId?: string }).exportId;
  const exp = exportId ? await db.bookExport.findUnique({ where: { id: exportId } }) : null;
  if (!exp) throw new PermanentProviderError("Export no longer exists");
  const book = await db.book.findUniqueOrThrow({ where: { id: exp.bookId }, include: { pages: true } });
  const router = getPrintRouter();
  const { provider, product } = await router.choose(exp.productId);

  const { fileUrl, launchBrowser, renderCoverPdf, renderInteriorPdf } = await import("../../print/render");
  const view = await buildBookView(book, { pageRules: product.pageRules, resolveUrl: fileUrl });
  const contentPages = view.pages.filter((p) => p.pageId !== null).length;
  const padding = planPadding(contentPages, product.pageRules);
  const pageCount = view.pages.length;

  const dims = await provider.getCoverDimensions(product, pageCount);
  const layout = coverLayout({ trim: getTrim(book.trimSize), widthIn: dims.widthIn, heightIn: dims.heightIn, spineIn: dims.spineIn, binding: product.binding, spineText: dims.spineTextAllowed });

  const browser = await launchBrowser();
  let interior, cover;
  try {
    interior = await renderInteriorPdf(browser, view);
    cover = await renderCoverPdf(browser, view, layout);
  } finally {
    await browser.close();
  }
  const [interiorInspection, coverInspection] = await Promise.all([inspectPdf(interior.pdf), inspectPdf(cover.pdf)]);
  const report = runPreflight({
    view,
    productLabel: product.label,
    pageRules: product.pageRules,
    padding,
    interior: { inspection: interiorInspection, textIssues: interior.textIssues, images: interior.images },
    cover: {
      inspection: coverInspection,
      textIssues: cover.textIssues,
      images: cover.images,
      expectedWidthIn: dims.widthIn,
      expectedHeightIn: dims.heightIn,
      approximate: dims.approximate,
      spineTextAllowed: dims.spineTextAllowed,
      hasSpineText: !!layout.spineText,
    },
  });

  const storage = getStorage();
  const interiorKey = keys.exportFile(book.userId, book.childId, book.id, exp.id, "interior");
  const coverKey = keys.exportFile(book.userId, book.childId, book.id, exp.id, "cover");
  await storage.put(interiorKey, interior.pdf, "application/pdf");
  await storage.put(coverKey, cover.pdf, "application/pdf");
  await db.bookExport.update({
    where: { id: exp.id },
    data: {
      status: "ready",
      pageCount,
      interiorKey,
      coverKey,
      coverDims: dims as unknown as Prisma.InputJsonValue,
      preflight: report as unknown as Prisma.InputJsonValue,
      preflightOk: report.ok,
      error: null,
    },
  });
  return { result: { pageCount, preflightOk: report.ok, errors: report.errors, warnings: report.warnings } };
}


/** The job: hand public signed URLs to the print provider and wait for its verdict. */
export async function validateHandler(job: GenerationJob): Promise<JobOutcome> {
  const exportId = (job.payload as { exportId?: string }).exportId;
  const exp = exportId ? await db.bookExport.findUnique({ where: { id: exportId } }) : null;
  if (!exp || !exp.interiorKey || !exp.coverKey || !exp.pageCount) throw new PermanentProviderError("Export files are missing");
  const { provider, product } = await getPrintRouter().choose(exp.productId);
  const cfg = getConfig();
  const ttl = cfg.PRINT_FILE_URL_TTL_SECONDS;
  const storage = getStorage();
  const interiorUrl = await storage.signedUrl(exp.interiorKey, ttl, { absolute: true });
  const coverUrl = await storage.signedUrl(exp.coverKey, ttl, { absolute: true });
  if (provider.name !== "mock" && isPrivateUrl(interiorUrl)) {
    throw new PermanentProviderError(publicUrlHelp(provider.name, interiorUrl));
  }
  const lease = cfg.JOB_LEASE_SECONDS * 1000;
  const result = await provider.validateFiles({
    interiorUrl,
    coverUrl,
    product,
    pageCount: exp.pageCount,
    onProgress: async (message) => {
      // Keep the job's lease alive during long provider checks, and show progress.
      await db.generationJob.update({ where: { id: job.id }, data: { lockedUntil: new Date(Date.now() + lease) } });
      await db.bookExport.update({ where: { id: exp.id }, data: { validationProgress: message } });
    },
  });
  await db.bookExport.update({
    where: { id: exp.id },
    data: { validationStatus: result.ok ? "passed" : "failed", validation: result as unknown as Prisma.InputJsonValue, validationProgress: null },
  });
  return { result: { ok: result.ok, problems: result.problems.length } };
}

/** Marks exports as failed when their job gives up (called by the runner). */
export async function exportJobGaveUp(job: GenerationJob, message: string) {
  const exportId = (job.payload as { exportId?: string }).exportId;
  if (!exportId) return;
  if (job.type === "book.export") await db.bookExport.updateMany({ where: { id: exportId }, data: { status: "failed", error: message } });
  if (job.type === "export.validate") await db.bookExport.updateMany({ where: { id: exportId }, data: { validationStatus: "failed", validationProgress: null, error: message } });
}

