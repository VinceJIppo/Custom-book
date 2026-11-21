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
import { BookPage } from "../../components/book/BookPage";
import { CoverSpread } from "../../components/book/CoverSpread";
import type { BookView } from "../books/viewTypes";
import type { CoverLayout } from "./cover";
import { BLEED_IN, SAFE_IN, getTrim, pageSizeWithBleed } from "./geometry";
import { getStorage } from "../storage";

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

/** Serves fonts and stored images to the headless browser. Raster art goes in as high-quality JPEG to keep PDFs a sensible size. */
async function serveAsset(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  const u = new URL(url);
  if (u.pathname.startsWith("/fonts/")) {
    const [, , pkg, file] = u.pathname.split("/");
    if (!/^[a-z]+$/.test(pkg) || !/^[a-z0-9.-]+$/.test(file)) return null;
    const p = path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file);
    if (!fs.existsSync(p)) return null;
    return { body: fs.readFileSync(p), contentType: file.endsWith(".woff2") ? "font/woff2" : "font/woff" };
  }
  if (u.pathname.startsWith("/files/")) {
    const key = decodeURIComponent(u.pathname.slice("/files/".length));
    const obj = await getStorage().get(key);
    if (!obj) return null;
    // Placeholder SVGs are rasterized (3x, about 300 ppi on a full page) so print files never carry vector transparency.
    const source = obj.meta.contentType === "image/svg+xml" ? sharp(obj.data, { density: 216 }) : sharp(obj.data);
    const jpeg = await source.flatten({ background: "#ffffff" }).toColorspace("srgb").jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
    return { body: jpeg, contentType: "image/jpeg" };
  }
  return null;
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
      return { page: i.page, key, ppi: i.ppi, placeholder: key.endsWith(".svg") };
    });
}

export async function renderInteriorPdf(browser: Browser, view: BookView): Promise<RenderedPdf> {
  const size = pageSizeWithBleed(getTrim(view.trim.id));
  const body = renderToStaticMarkup(
    <>
      {view.pages.map((p) => (
        <BookPage key={p.number} page={p} book={view} mode="print" />
      ))}
    </>,
  );
  return withPage(browser, htmlDocument(body, size.widthIn, size.heightIn), async (page) => {
    const m = await measure(page, ".bk-page", BLEED_IN + SAFE_IN);
    const pdf = await page.pdf({ width: `${size.widthIn}in`, height: `${size.heightIn}in`, printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    return { pdf, pages: view.pages.length, textIssues: m.textIssues, images: toImageChecks(m.images) };
  });
}

export async function renderCoverPdf(browser: Browser, view: BookView, layout: CoverLayout): Promise<RenderedPdf> {
  const body = renderToStaticMarkup(<CoverSpread book={view} layout={layout} mode="print" />);
  return withPage(browser, htmlDocument(body, layout.widthIn, layout.heightIn), async (page) => {
    // Cover text is placed inside each panel's safe area by construction; check only for overflow here.
    const m = await measure(page, ".bk-cover-spread", 0);
    const pdf = await page.pdf({ width: `${layout.widthIn}in`, height: `${layout.heightIn}in`, printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    return { pdf, pages: 1, textIssues: m.textIssues, images: toImageChecks(m.images) };
  });
}

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  try {
    return await chromium.launch();
  } catch (err) {
    throw new Error(
      `Couldn't start the PDF renderer (headless Chromium). Run "npx playwright install chromium" once, then try again. (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`,
    );
  }
}
