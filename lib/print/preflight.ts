/**
 * Preflight: every check a printer cares about, reported in plain English
 * before any order is allowed. Errors block printing; warnings don't.
 */
import type { BookView } from "../books/viewTypes";
import type { PdfInspection } from "./pdfInspect";
import type { ImageCheck, TextIssue } from "./render";
import type { PaddingPlan, PageCountRules } from "./padding";
import { pageSizeWithBleed, getTrim } from "./geometry";

export type PreflightLevel = "error" | "warning" | "pass";

export interface PreflightItem {
  level: PreflightLevel;
  code: string;
  message: string;
  page?: number;
}

export interface PreflightReport {
  ok: boolean;
  errors: number;
  warnings: number;
  items: PreflightItem[];
}

/** Lulu: images at 300 ppi minimum and no more than 600. Below 200 is visibly soft. */
export const MIN_PPI = 300;
export const HARD_MIN_PPI = 200;
export const MAX_PPI = 600;
const SIZE_TOLERANCE_IN = 0.01;

export interface PreflightInput {
  view: BookView;
  productLabel: string;
  pageRules: PageCountRules;
  padding: PaddingPlan;
  interior: { inspection: PdfInspection; textIssues: TextIssue[]; images: ImageCheck[] };
  cover: { inspection: PdfInspection; textIssues: TextIssue[]; images: ImageCheck[]; expectedWidthIn: number; expectedHeightIn: number; approximate?: boolean; spineTextAllowed: boolean; hasSpineText: boolean };
}

export function runPreflight(input: PreflightInput): PreflightReport {
  const items: PreflightItem[] = [];
  const err = (code: string, message: string, page?: number) => items.push({ level: "error", code, message, page });
  const warn = (code: string, message: string, page?: number) => items.push({ level: "warning", code, message, page });
  const pass = (code: string, message: string) => items.push({ level: "pass", code, message });
  const { view, interior, cover } = input;

  // Page count
  const n = interior.inspection.pageCount;
  if (input.padding.problems.length) input.padding.problems.forEach((p) => err("page-count", p));
  else if (n < input.pageRules.minPages || n > input.pageRules.maxPages) err("page-count", `${input.productLabel} needs ${input.pageRules.minPages} to ${input.pageRules.maxPages} pages; this file has ${n}.`);
  else if (n % input.pageRules.multiple !== 0) err("page-count", `The page count (${n}) must be a multiple of ${input.pageRules.multiple}.`);
  else if (n !== view.pages.length) err("page-count", `The PDF has ${n} pages but the book has ${view.pages.length}.`);
  else pass("page-count", `${n} pages, within ${input.productLabel}'s ${input.pageRules.minPages} to ${input.pageRules.maxPages}${input.padding.padPages ? ` (${input.padding.padPages} designed pages added at the end)` : ""}.`);

  // Interior page size
  const want = pageSizeWithBleed(getTrim(view.trim.id));
  const wrong = interior.inspection.pageSizesIn.map((s, i) => ({ s, i })).filter(({ s }) => Math.abs(s.width - want.widthIn) > SIZE_TOLERANCE_IN || Math.abs(s.height - want.heightIn) > SIZE_TOLERANCE_IN);
  if (wrong.length) err("page-size", `${wrong.length} page(s) are not ${want.widthIn} x ${want.heightIn} in (trim plus 0.125 in bleed). First: page ${wrong[0].i + 1} is ${wrong[0].s.width} x ${wrong[0].s.height} in.`, wrong[0].i + 1);
  else pass("page-size", `Every page is ${want.widthIn} x ${want.heightIn} in: ${view.trim.widthIn} x ${view.trim.heightIn} in trim plus 0.125 in bleed on each side.`);

  // Missing or pending art
  const missing = view.pages.filter((p) => p.kind === "story" && p.half !== "right" && !p.imageUrl);
  if (missing.length) err("missing-art", `${missing.length} story page(s) have no picture yet (first: page ${missing[0].number}). Redraw them before printing.`, missing[0].number);
  if (!view.cover.imageUrl) err("missing-art", "The cover has no picture yet.");
  if (!missing.length && view.cover.imageUrl) pass("missing-art", "Every story page and the cover have a picture.");

  // Likeness flags
  const flagged = view.pages.filter((p) => p.imageStatus === "flagged" && p.half !== "right");
  if (flagged.length) warn("likeness", `${flagged.length} picture(s) may not look like the character sheet (first: page ${flagged[0].number}). Review them in the page editor, or keep them if they look right.`, flagged[0].number);

  // Resolution
  const all = [...interior.images, ...cover.images.map((i) => ({ ...i, page: 0 }))];
  const placeholders = all.filter((i) => i.placeholder);
  const real = all.filter((i) => !i.placeholder);
  const tooLow = real.filter((i) => i.ppi < HARD_MIN_PPI);
  const soft = real.filter((i) => i.ppi >= HARD_MIN_PPI && i.ppi < MIN_PPI);
  const tooHigh = real.filter((i) => i.ppi > MAX_PPI);
  const where = (i: { page: number }) => (i.page === 0 ? "the cover" : `page ${i.page}`);
  if (tooLow.length) err("resolution", `${tooLow.length} picture(s) are too low-resolution to print well (${tooLow[0].ppi} ppi on ${where(tooLow[0])}; ${MIN_PPI} needed). Redraw them.`, tooLow[0].page || undefined);
  if (soft.length) warn("resolution", `${soft.length} picture(s) are a little below ${MIN_PPI} ppi (lowest ${Math.min(...soft.map((i) => i.ppi))} ppi on ${where(soft[0])}). They will print slightly soft.`, soft[0].page || undefined);
  if (tooHigh.length) warn("resolution", `${tooHigh.length} picture(s) are above ${MAX_PPI} ppi; the printer will downsample them (no action needed).`);
  if (real.length && !tooLow.length && !soft.length) pass("resolution", `All ${real.length} pictures are at least ${MIN_PPI} ppi as placed.`);
  if (placeholders.length) warn("placeholder", `${placeholders.length} picture(s) are placeholder art from the mock image provider. Fine for testing, not for a real book.`);

  // Text fit and safe area (interior)
  const overflow = interior.textIssues.filter((t) => t.kind === "overflow");
  const outside = interior.textIssues.filter((t) => t.kind === "outsideSafeArea");
  for (const t of overflow) err("text-fit", `Page ${t.page}: the text doesn't fit in its box ("${t.text}..."). Shorten it or choose a layout with more room.`, t.page);
  for (const t of outside) err("safe-area", `Page ${t.page}: text comes within 0.5 in of the trim edge ("${t.text}..."), where it could be cut off.`, t.page);
  if (!overflow.length && !outside.length) pass("text", "All text fits its box and stays at least 0.5 in inside the trim (more on the binding side).");

  // Fonts, transparency, encryption (both files)
  for (const [label, insp] of [["Interior", interior.inspection], ["Cover", cover.inspection]] as const) {
    const unembedded = insp.fonts.filter((f) => !f.embedded);
    if (unembedded.length) err("fonts", `${label}: these fonts are not embedded: ${unembedded.map((f) => f.name).join(", ")}.`);
    if (insp.encrypted) err("security", `${label}: the PDF is password-protected or encrypted; printers can't use it.`);
    if (insp.transparency.length) warn("transparency", `${label}: contains ${insp.transparency.join(" and ")}. Lulu asks for flattened files; it can usually fix this, but check the proof.`);
  }
  if (![interior.inspection, cover.inspection].some((i) => i.fonts.some((f) => !f.embedded) || i.encrypted)) pass("fonts", "All fonts are embedded and neither PDF is protected.");
  if (!interior.inspection.transparency.length && !cover.inspection.transparency.length) pass("transparency", "No transparency to flatten.");

  // Cover
  if (cover.inspection.pageCount !== 1) err("cover", `The cover must be one page (back, spine and front together); it has ${cover.inspection.pageCount}.`);
  const cs = cover.inspection.pageSizesIn[0];
  if (cs && (Math.abs(cs.width - cover.expectedWidthIn) > SIZE_TOLERANCE_IN || Math.abs(cs.height - cover.expectedHeightIn) > SIZE_TOLERANCE_IN)) {
    err("cover-size", `The cover is ${cs.width} x ${cs.height} in but should be ${cover.expectedWidthIn} x ${cover.expectedHeightIn} in for ${n} pages.`);
  } else if (cs) {
    pass("cover-size", `Cover is ${cs.width} x ${cs.height} in, matching the size for ${n} pages.`);
  }
  if (cover.approximate) warn("cover-size", "The cover size is an offline estimate. Connect Lulu to get the exact size before ordering.");
  if (cover.hasSpineText && !cover.spineTextAllowed) err("spine", "This book is too thin for spine text (Lulu: 80 pages or fewer means no spine text).");
  else pass("spine", cover.hasSpineText ? "Spine text is allowed for this page count." : `No spine text, as required for books of 80 pages or fewer.`);
  for (const t of cover.textIssues) err("cover-text", `Cover: the text doesn't fit ("${t.text}..."). Shorten the title or blurb.`);

  const errors = items.filter((i) => i.level === "error").length;
  const warnings = items.filter((i) => i.level === "warning").length;
  // Errors first, then warnings, then passes.
  const order: Record<PreflightLevel, number> = { error: 0, warning: 1, pass: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  return { ok: errors === 0, errors, warnings, items };
}
