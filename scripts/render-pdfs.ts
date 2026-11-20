/**
 * Renders a book's print PDFs from the command line (no web server needed),
 * runs preflight, and saves the files next to you.
 *
 *   npm run render:pdfs -- <bookId> [productId] [outDir]
 *   productId defaults to the hardcover for the book's size.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";

async function main() {
  const [bookId, productArg, outArg] = process.argv.slice(2);
  if (!bookId) {
    console.error("Usage: npm run render:pdfs -- <bookId> [productId] [outDir]");
    process.exit(1);
  }
  const { db } = await import("../lib/db");
  const { buildBookView } = await import("../lib/books/view");
  const { getPrintRouter } = await import("../lib/providers/registry");
  const { fileUrl, launchBrowser, renderCoverPdf, renderInteriorPdf } = await import("../lib/print/render");
  const { inspectPdf } = await import("../lib/print/pdfInspect");
  const { coverLayout } = await import("../lib/print/cover");
  const { getTrim } = await import("../lib/print/geometry");
  const { planPadding } = await import("../lib/print/padding");
  const { runPreflight } = await import("../lib/print/preflight");

  const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
  const router = getPrintRouter();
  const productId = productArg ?? (await router.defaultProduct(book.trimSize)).id;
  const { provider, product } = await router.choose(productId);
  const view = await buildBookView(book, { pageRules: product.pageRules, resolveUrl: fileUrl });
  const padding = planPadding(view.pages.filter((p) => p.pageId).length, product.pageRules);
  const dims = await provider.getCoverDimensions(product, view.pages.length);
  const layout = coverLayout({ trim: getTrim(book.trimSize), widthIn: dims.widthIn, heightIn: dims.heightIn, spineIn: dims.spineIn, binding: product.binding, spineText: dims.spineTextAllowed });

  const t0 = Date.now();
  const browser = await launchBrowser();
  const interior = await renderInteriorPdf(browser, view);
  const cover = await renderCoverPdf(browser, view, layout);
  await browser.close();
  const report = runPreflight({
    view,
    productLabel: product.label,
    pageRules: product.pageRules,
    padding,
    interior: { inspection: await inspectPdf(interior.pdf), textIssues: interior.textIssues, images: interior.images },
    cover: { inspection: await inspectPdf(cover.pdf), textIssues: cover.textIssues, images: cover.images, expectedWidthIn: dims.widthIn, expectedHeightIn: dims.heightIn, approximate: dims.approximate, spineTextAllowed: dims.spineTextAllowed, hasSpineText: !!layout.spineText },
  });

  const outDir = outArg ?? path.join(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${book.id}-interior.pdf`), interior.pdf);
  fs.writeFileSync(path.join(outDir, `${book.id}-cover.pdf`), cover.pdf);
  console.log(`Rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outDir}`);
  console.log(`${product.label} (${product.sku}), ${view.pages.length} pages, cover ${dims.widthIn} x ${dims.heightIn} in`);
  for (const item of report.items) console.log(`  ${item.level === "pass" ? "ok  " : item.level === "warning" ? "warn" : "FAIL"}  ${item.message}`);
  await db.$disconnect();
  process.exit(report.ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
