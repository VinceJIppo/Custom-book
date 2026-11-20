/**
 * Print products we offer, with the Lulu POD package IDs (new "dotted" format,
 * live since March 31, 2026; the old 27-character format ends Feb 1, 2027).
 * Source: Lulu Print API spec sheet and Book Creation Guide, read 2026-11-20.
 * All are premium full color on 80# coated white paper with a gloss cover.
 */
import type { TrimSizeId } from "./geometry";
import type { PageCountRules } from "./padding";

export type Binding = "hardcover" | "softcover";

export interface CatalogProduct {
  id: string;
  label: string;
  trimSize: TrimSizeId;
  binding: Binding;
  paper: string;
  luluSku: string;
  pageRules: PageCountRules;
}

/**
 * Page rules: Lulu lists 24 to 800 pages for case wrap hardcovers and says
 * paperbacks need at least 32 pages. Lulu does not require an even count, but
 * we keep pages in pairs so facing pages and spreads stay correct.
 */
export const CATALOG: CatalogProduct[] = [
  {
    id: "hardcover-square-8.5",
    label: "Hardcover, 8.5 x 8.5 in square",
    trimSize: "square-8.5",
    binding: "hardcover",
    paper: "80# coated white, premium color, gloss cover",
    luluSku: "0850X0850.FC.PRE.CW.080CW444.GXX",
    pageRules: { minPages: 24, maxPages: 800, multiple: 2 },
  },
  {
    id: "softcover-square-8.5",
    label: "Softcover, 8.5 x 8.5 in square",
    trimSize: "square-8.5",
    binding: "softcover",
    paper: "80# coated white, premium color, gloss cover",
    luluSku: "0850X0850.FC.PRE.PB.080CW444.GXX",
    pageRules: { minPages: 32, maxPages: 800, multiple: 2 },
  },
  {
    id: "hardcover-letter",
    label: "Hardcover, 8.5 x 11 in portrait",
    trimSize: "portrait-8.5x11",
    binding: "hardcover",
    paper: "80# coated white, premium color, gloss cover",
    luluSku: "0850X1100.FC.PRE.CW.080CW444.GXX",
    pageRules: { minPages: 24, maxPages: 800, multiple: 2 },
  },
  {
    id: "softcover-letter",
    label: "Softcover, 8.5 x 11 in portrait",
    trimSize: "portrait-8.5x11",
    binding: "softcover",
    paper: "80# coated white, premium color, gloss cover",
    luluSku: "0850X1100.FC.PRE.PB.080CW444.GXX",
    pageRules: { minPages: 32, maxPages: 800, multiple: 2 },
  },
];

export const DEFAULT_PRODUCT_ID = "hardcover-square-8.5";

export function catalogProduct(id: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function productsForTrim(trimSize: string): CatalogProduct[] {
  return CATALOG.filter((p) => p.trimSize === trimSize);
}

/** Lulu hardcover spine widths by page count (Book Creation Guide, "Hardcover Covers"). */
const HARDCOVER_SPINE: Array<[number, number]> = [
  [84, 0.25], [140, 0.5], [168, 0.625], [194, 0.688], [222, 0.75], [250, 0.813], [278, 0.875], [306, 0.938], [334, 1],
  [360, 1.063], [388, 1.125], [416, 1.188], [444, 1.25], [472, 1.313], [500, 1.375], [528, 1.438], [556, 1.5], [582, 1.563],
  [610, 1.625], [638, 1.688], [666, 1.75], [694, 1.813], [722, 1.875], [750, 1.938], [778, 2], [799, 2.063], [800, 2.125],
];

/** Spine width in inches per Lulu's guide. Paperback: pages / 444 + 0.06 in. */
export function luluSpineWidthIn(binding: Binding, pageCount: number): number {
  if (binding === "softcover") return Math.round((pageCount / 444 + 0.06) * 1000) / 1000;
  if (pageCount < 24) throw new Error("Hardcover books need at least 24 pages");
  for (const [max, width] of HARDCOVER_SPINE) if (pageCount <= max) return width;
  throw new Error("Hardcover books can have at most 800 pages");
}

/** Lulu: "If your book is 80 pages or fewer, do not include spine text." */
export function spineTextAllowed(pageCount: number): boolean {
  return pageCount > 80;
}
