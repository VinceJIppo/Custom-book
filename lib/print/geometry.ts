/**
 * Single source of truth for physical book geometry. Templates, preflight,
 * PDF rendering and print adapters all read from here. Units are inches unless
 * a name ends in Px.
 */
import type { Layout } from "../schemas/story";

export const BLEED_IN = 0.125;
/** Minimum distance from the trim edge for text and faces. */
export const SAFE_IN = 0.5;
/** Extra margin on the binding side, on top of SAFE_IN. */
export const GUTTER_IN = 0.25;
export const PRINT_PPI = 300;

export const TRIM_SIZES = {
  "square-8.5": { id: "square-8.5", label: "8.5 x 8.5 in square", widthIn: 8.5, heightIn: 8.5 },
  "portrait-8.5x11": { id: "portrait-8.5x11", label: "8.5 x 11 in portrait", widthIn: 8.5, heightIn: 11 },
  /** Legacy (Phase 1). Lulu has no full-color 8 x 10 product, so it is no longer offered. */
  "portrait-8x10": { id: "portrait-8x10", label: "8 x 10 in portrait", widthIn: 8, heightIn: 10 },
} as const;
export type TrimSizeId = keyof typeof TRIM_SIZES;
export type TrimSize = (typeof TRIM_SIZES)[TrimSizeId];
export const DEFAULT_TRIM: TrimSizeId = "square-8.5";

export function getTrim(id: string): TrimSize {
  const t = (TRIM_SIZES as Record<string, TrimSize>)[id];
  if (!t) throw new Error(`Unknown trim size: ${id}`);
  return t;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Interior page size including bleed on every side (single-page PDF layout). */
export function pageSizeWithBleed(trim: TrimSize) {
  return { widthIn: round4(trim.widthIn + 2 * BLEED_IN), heightIn: round4(trim.heightIn + 2 * BLEED_IN) };
}

export function inchesToPx(inches: number, ppi = PRINT_PPI): number {
  return Math.round(inches * ppi);
}

/** Pixel size for a full-bleed interior image (8.5 square trim -> 2625 x 2625). */
export function fullBleedPx(trim: TrimSize, ppi = PRINT_PPI) {
  const s = pageSizeWithBleed(trim);
  return { widthPx: inchesToPx(s.widthIn, ppi), heightPx: inchesToPx(s.heightIn, ppi) };
}

/** Page 1 is a right-hand (recto) page. Its binding edge is on the left. */
export function isRecto(pageNumber: number): boolean {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error(`Invalid page number ${pageNumber}`);
  return pageNumber % 2 === 1;
}

export function bindingSide(pageNumber: number): "left" | "right" {
  return isRecto(pageNumber) ? "left" : "right";
}

/**
 * Area where text and faces may go, in bleed-box coordinates (origin at the
 * top-left corner of the bleed box).
 */
export function safeBox(trim: TrimSize, pageNumber: number): Box {
  const { widthIn, heightIn } = pageSizeWithBleed(trim);
  const inner = BLEED_IN + SAFE_IN + GUTTER_IN;
  const outer = BLEED_IN + SAFE_IN;
  const left = bindingSide(pageNumber) === "left" ? inner : outer;
  const right = bindingSide(pageNumber) === "right" ? inner : outer;
  return {
    x: round4(left),
    y: round4(outer),
    width: round4(widthIn - left - right),
    height: round4(heightIn - 2 * outer),
  };
}

/** Fraction of the page height given to the picture in the imageTop layout. */
export const IMAGE_TOP_FRACTION = 0.64;
/**
 * Front cover: the title gets its own band across the top (this share of the
 * page height) and the cover picture is drawn to fit the space below it, so the
 * title can never hide a head or face.
 */
export const COVER_TITLE_BAND = 0.36;
/** Spot art size in the textSpot layout, as a fraction of trim width. */
export const SPOT_FRACTION = 0.5;

/** Size of the illustration a layout places, in inches. */
export function illustrationSizeIn(layout: Layout, trim: TrimSize): { widthIn: number; heightIn: number } {
  const page = pageSizeWithBleed(trim);
  switch (layout) {
    case "spread":
      // One image across two facing pages: outer bleeds only, no bleed at the fold.
      return { widthIn: round4(2 * trim.widthIn + 2 * BLEED_IN), heightIn: page.heightIn };
    case "imageTop":
      return { widthIn: page.widthIn, heightIn: round4(page.heightIn * IMAGE_TOP_FRACTION) };
    case "textSpot":
    case "theEnd": {
      const s = round4(trim.widthIn * SPOT_FRACTION);
      return { widthIn: s, heightIn: s };
    }
    default:
      return page;
  }
}

/** Target pixels for print at 300 ppi for a layout. Generated art is upscaled to this. */
export function illustrationTargetPx(layout: Layout, trim: TrimSize) {
  const s = illustrationSizeIn(layout, trim);
  return { widthPx: inchesToPx(s.widthIn), heightPx: inchesToPx(s.heightIn), aspect: round4(s.widthIn / s.heightIn) };
}

/** Wraparound cover size. The spine width comes from the print provider. */
export function coverSpreadSizeIn(trim: TrimSize, spineIn: number, wrapIn = BLEED_IN) {
  return {
    widthIn: round4(2 * trim.widthIn + spineIn + 2 * wrapIn),
    heightIn: round4(trim.heightIn + 2 * wrapIn),
  };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
