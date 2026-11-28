/**
 * Renders print-ready PDFs from the same React page components the flipbook
 * uses. Runs in the background worker: React renders static HTML, headless
 * Chromium (Playwright) loads it with images and fonts served straight from
 * storage via request interception, measures the layout, and prints PDFs.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "playwright";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { BookPage } from "../../components/book/BookPage";
import { CoverSpread } from "../../components/book/CoverSpread";
import type { BookView } from "../books/viewTypes";
import type { CoverLayout } from "./cover";
import { BLEED_IN, SAFE_IN, getTrim, pageSizeWithBleed } from "./geometry";
import { getStorage } from "../storage";
import { FIT_TEXT_SOURCE } from "./fitText";

/** Print resolution every picture is brought up to (Lulu asks for 300 ppi). */
const TARGET_PPI = 305;

/** Fake origin that never leaves the machine: every request to it is answered locally. */
export const ASSET_ORIGIN = "https://assets.storystar.invalid";
export const fileUrl = (key: string) => `${ASSET_ORIGIN}/files/${key}`;

const FONT_CSS = [
  ["andika", "latin-400.css"],
  ["andika", "latin-400-italic.css"],
  ["andika", "latin-700.css"],
  ["fredoka", "latin-500.css"],
  ["fredoka", "latin-600.css"],
  ["eb-garamond", "latin-400.css"],
  ["eb-garamond", "latin-400-italic.css"],
  ["eb-garamond", "latin-500.css"],
  ["cormorant-garamond", "latin-500.css"],
  ["cormorant-garamond", "latin-500-italic.css"],
] as const;

function fontFaces(): string {
  return FONT_CSS.map(([pkg, file]) => {
    const css = fs.readFileSync(path.join(process.cwd(), "node_modules", "@fontsource", pkg, file), "utf8");
    return css.replace(/url\(\.\/files\//g, `url(${ASSET_ORIGIN}/fonts/${pkg}/`);
  }).join("\n");
}

function bookCss(): string {
  return fs.readFileSync(path.join(process.cwd(), "components", "book", "book.css"), "utf8");
}

function htmlDocument(body: string, widthIn: number, heightIn: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${widthIn}in ${heightIn}in; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.bk-page:last-child { break-after: auto; }
${fontFaces()}
${bookCss()}
</style></head><body>${body}</body></html>`;
}

export interface TextIssue {
  page: number;
  kind: "overflow" | "outsideSafeArea";
  text: string;
}

export interface ImageCheck {
  page: number;
  key: string;
  /** Effective resolution as placed on the page. */
  ppi: number;
  placeholder: boolean;
}

export interface RenderedPdf {
  pdf: Buffer;
  pages: number;
  textIssues: TextIssue[];
  images: ImageCheck[];
}

/**
 * Print pictures are big (decoded, enlarged and faded, each holds tens of megabytes), and the
 * browser asks for several at once. Preparing them one at a time keeps the worker's memory low.
 */
let imageQueue: Promise<unknown> = Promise.resolve();
function oneImageAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = imageQueue.then(fn, fn);
  imageQueue = run.catch(() => undefined);
  return run;
}

/** Serves fonts and stored images to the headless browser. Raster art goes in as high-quality JPEG to keep PDFs a sensible size. */
async function serveAsset(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  const u = new URL(url);
  if (u.pathname.startsWith("/fonts/")) {
    const [, , pkg, file] = u.pathname.split("/");
    if (!/^[a-z][a-z-]*$/.test(pkg) || !/^[a-z0-9.-]+$/.test(file)) return null;
    const p = path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file);
    if (!fs.existsSync(p)) return null;
    return { body: fs.readFileSync(p), contentType: file.endsWith(".woff2") ? "font/woff2" : "font/woff" };
  }
  if (u.pathname.startsWith("/files/")) return oneImageAtATime(() => servePicture(u));
  return null;
}

async function servePicture(u: URL): Promise<{ body: Buffer; contentType: string } | null> {
  const key = decodeURIComponent(u.pathname.slice("/files/".length));
  const obj = await getStorage().get(key);
  if (!obj) return null;
  // Placeholder SVGs are rasterized (3x, about 300 ppi on a full page) so print files never carry vector transparency.
  let source = obj.meta.contentType === "image/svg+xml" ? sharp(obj.data, { density: 216 }) : sharp(obj.data);
  // ?scale=: the picture is placed too large for its pixels; enlarge it (Lanczos) so it prints at 300 ppi.
  const scale = Math.min(4, Number(u.searchParams.get("scale") ?? "1"));
  if (scale > 1.001) {
    const meta = await source.metadata();
    source = sharp(await source.resize({ width: Math.round((meta.width ?? 1000) * scale), kernel: "lanczos3" }).toBuffer());
  }
  // ?feather=1: soft-edged pictures floating on a white page blend into the paper (no visible grey box).
  if (u.searchParams.get("feather") === "1") {
    const paper = /^[0-9a-f]{6}$/i.test(u.searchParams.get("paper") ?? "") ? `#${u.searchParams.get("paper")}` : "#ffffff";
    source = sharp(await featherToWhite(await source.toBuffer(), paper));
  }
  const jpeg = await source.flatten({ background: "#ffffff" }).toColorspace("srgb").jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  return { body: jpeg, contentType: "image/jpeg" };
}

/**
 * Lifts the near-white background of a vignette picture to pure white and fades
 * its edges into white, so it sits on the page like paint on paper. The result is
 * opaque (flattened), so the PDF needs no transparency.
 */
export async function featherToWhite(input: Buffer, paper = "#ffffff"): Promise<Buffer> {
  const pr = [1, 3, 5].map((i) => parseInt(paper.slice(i, i + 2), 16));
  const img = sharp(input).flatten({ background: paper }).removeAlpha();
  const { width = 1, height = 1 } = await img.metadata();
  const inset = Math.round(Math.min(width, height) * 0.05);
  const mask = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><rect x="${inset}" y="${inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" fill="white"/></svg>`,
    ),
  )
    .blur(Math.max(1, inset * 0.6))
    .greyscale()
    .raw()
    .toBuffer();
  // Paper is pure white: near-white pixels (the painting's paper) become white;
  // anything with real color is left alone.
  const lifted = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = lifted.info.channels;
  for (let i = 0; i < lifted.data.length; i += ch) {
    const m = Math.min(lifted.data[i], lifted.data[i + 1], lifted.data[i + 2]);
    if (m <= 214) continue;
    const t = Math.min(1, (m - 214) / 20);
    for (let c = 0; c < 3; c++) lifted.data[i + c] = Math.round(lifted.data[i + c] + (pr[c] - lifted.data[i + c]) * t);
  }
  return sharp(lifted.data, { raw: { width, height, channels: lifted.info.channels } })
    .joinChannel(mask, { raw: { width, height, channels: 1 } })
    .flatten({ background: paper })
    .png()
    .toBuffer();
}

/**
 * Before measuring: fit every text box (shrink a little, let capped boxes grow),
 * blend vignette pictures into the page, and enlarge any picture placed below
 * 300 ppi, so problems are fixed here instead of being handed to the parent.
 */
async function autoFix(page: import("playwright").Page) {
  await page.evaluate(`${FIT_TEXT_SOURCE}(document)`);
  const changed = await page.evaluate((target: number) => {
    let n = 0;
    document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      if (!src.includes("/files/") || src.includes("?")) return;
      const r = img.getBoundingClientRect();
      if (!r.width || !r.height || !img.naturalWidth) return;
      const ppi = Math.min(img.naturalWidth / (r.width / 96), img.naturalHeight / (r.height / 96));
      const params = new URLSearchParams();
      if (ppi < target) params.set("scale", (target / ppi + 0.01).toFixed(3));
      if (img.closest(".bk-vignette")) {
        params.set("feather", "1");
        // Fade into the page's own paper color (cream for Hand-painted whimsy).
        const bg = getComputedStyle(img.closest(".bk-page") ?? document.body).backgroundColor.match(/\d+/g);
        if (bg && bg.length >= 3) params.set("paper", bg.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join(""));
      }
      if ([...params.keys()].length) {
        img.setAttribute("src", `${src}?${params.toString()}`);
        n++;
      }
    });
    return n;
  }, TARGET_PPI);
  if (changed) {
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map((img) => (img.complete && img.naturalWidth ? img.decode().catch(() => null) : new Promise((r) => { img.onload = img.onerror = () => r(null); }))));
    });
  }
}

async function withPage<T>(browser: Browser, html: string, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ deviceScaleFactor: 1, javaScriptEnabled: true });
  try {
    const page = await context.newPage();
    await page.route(`${ASSET_ORIGIN}/**`, async (route) => {
      const asset = await serveAsset(route.request().url());
      if (!asset) return route.fulfill({ status: 404, body: "not found" });
      return route.fulfill({ status: 200, body: asset.body, contentType: asset.contentType });
    });
    // Block everything else: print files must not depend on the network.
    await page.route(/^(?!https:\/\/assets\.storystar\.invalid\/).*/, (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : img.decode().catch(() => null))));
    });
    return await fn(page);
  } finally {
    await context.close();
  }
}

/** Text overflow and safe-area checks, plus effective image resolution, measured in the real layout. */
async function measure(page: import("playwright").Page, pageSelector: string, safeInsetIn: number) {
  return page.evaluate(
    ({ pageSelector, safeInsetPx }) => {
      const textIssues: Array<{ page: number; kind: "overflow" | "outsideSafeArea"; text: string }> = [];
      const images: Array<{ page: number; src: string; ppi: number }> = [];
      document.querySelectorAll<HTMLElement>(pageSelector).forEach((pageEl, i) => {
        const pr = pageEl.getBoundingClientRect();
        pageEl.querySelectorAll<HTMLElement>(".bk-text, .bk-cover-title, .bk-back, .bk-spine-text").forEach((t) => {
          const snippet = (t.textContent ?? "").trim().slice(0, 40);
          if (!snippet) return;
          if (t.scrollHeight > t.clientHeight + 2 || t.scrollWidth > t.clientWidth + 2) textIssues.push({ page: i + 1, kind: "overflow", text: snippet });
          const r = t.getBoundingClientRect();
          if (safeInsetPx > 0 && (r.left < pr.left + safeInsetPx - 1 || r.top < pr.top + safeInsetPx - 1 || r.right > pr.right - safeInsetPx + 1 || r.bottom > pr.bottom - safeInsetPx + 1)) {
            textIssues.push({ page: i + 1, kind: "outsideSafeArea", text: snippet });
          }
        });
        pageEl.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
          const r = img.getBoundingClientRect();
          // CSS px are 1/96 in. object-fit: cover crops, so the tighter axis decides the resolution.
          const ppi = Math.min(img.naturalWidth / (r.width / 96), img.naturalHeight / (r.height / 96));
          images.push({ page: i + 1, src: img.getAttribute("src") ?? "", ppi: Math.round(ppi) });
        });
      });
      return { textIssues, images };
    },
    { pageSelector, safeInsetPx: safeInsetIn * 96 },
  );
}

function toImageChecks(raw: Array<{ page: number; src: string; ppi: number }>): ImageCheck[] {
  const prefix = `${ASSET_ORIGIN}/files/`;
  return raw
    .filter((i) => i.src.startsWith(prefix))
    .map((i) => {
      const key = decodeURIComponent(i.src.slice(prefix.length));
      return { page: i.page, key: key.split("?")[0], ppi: i.ppi, placeholder: key.split("?")[0].endsWith(".svg") };
    });
}

/**
 * Pages per browser pass. A whole book at print resolution in one browser page holds every
 * picture in memory at once (well over a gigabyte), which can take down a small server, so
 * the interior is drawn a few pages at a time and the parts are joined.
 */
export const INTERIOR_PAGES_PER_PASS = 4;

export async function renderInteriorPdf(browser: Browser, view: BookView, pagesPerPass = INTERIOR_PAGES_PER_PASS): Promise<RenderedPdf> {
  const size = pageSizeWithBleed(getTrim(view.trim.id));
  const merged = await PDFDocument.create();
  const textIssues: TextIssue[] = [];
  const images: Array<{ page: number; src: string; ppi: number }> = [];
  for (let start = 0; start < view.pages.length; start += pagesPerPass) {
    const body = renderToStaticMarkup(
      <>
        {view.pages.slice(start, start + pagesPerPass).map((p) => (
          <BookPage key={p.number} page={p} book={view} mode="print" />
        ))}
      </>,
    );
    const part = await withPage(browser, htmlDocument(body, size.widthIn, size.heightIn), async (page) => {
      await autoFix(page);
      const m = await measure(page, ".bk-page", BLEED_IN + SAFE_IN);
      const pdf = await page.pdf({ width: `${size.widthIn}in`, height: `${size.heightIn}in`, printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
      return { pdf, m };
    });
    // Page numbers in the checks count from the start of the book, not of this pass.
    for (const t of part.m.textIssues) textIssues.push({ ...t, page: t.page + start });
    for (const i of part.m.images) images.push({ ...i, page: i.page + start });
    const doc = await PDFDocument.load(part.pdf);
    for (const pg of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(pg);
  }
  // Classic cross-reference tables (no object streams): the most widely accepted form for print.
  const pdf = Buffer.from(await merged.save({ useObjectStreams: false }));
  return { pdf, pages: view.pages.length, textIssues, images: toImageChecks(images) };
}

export async function renderCoverPdf(browser: Browser, view: BookView, layout: CoverLayout): Promise<RenderedPdf> {
  const body = renderToStaticMarkup(<CoverSpread book={view} layout={layout} mode="print" />);
  return withPage(browser, htmlDocument(body, layout.widthIn, layout.heightIn), async (page) => {
    // Cover text is placed inside each panel's safe area by construction; check only for overflow here.
    await autoFix(page);
    const m = await measure(page, ".bk-cover-spread", 0);
    const pdf = await page.pdf({ width: `${layout.widthIn}in`, height: `${layout.heightIn}in`, printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    return { pdf, pages: 1, textIssues: m.textIssues, images: toImageChecks(m.images) };
  });
}

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  try {
    // In a container /dev/shm is tiny (64 MB); large print pages would crash the renderer there.
    return await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  } catch (err) {
    throw new Error(
      `Couldn't start the PDF renderer (headless Chromium). Run "npx playwright install chromium" once, then try again. (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`,
    );
  }
}
