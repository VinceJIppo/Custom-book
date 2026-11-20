/**
 * Wraparound cover geometry: one landscape spread of back cover, spine and
 * front cover. The total size comes from the print provider (Lulu's
 * /cover-dimensions/ endpoint), so whatever wrap and bleed the binding needs is
 * included; we place the panels symmetrically inside it.
 */
import { BLEED_IN, SAFE_IN, type Box, type TrimSize } from "./geometry";
import type { Binding } from "./products";

/** Extra keep-out next to the spine on hardcovers, where the case board hinges. */
export const HINGE_IN = 0.375;
/** Lulu: leave at least 0.125 in between spine text and each spine edge. */
export const SPINE_TEXT_MARGIN_IN = 0.125;

export interface CoverLayout {
  widthIn: number;
  heightIn: number;
  spineIn: number;
  /** Margin outside the trim on each side (wrap and/or bleed). */
  marginXIn: number;
  marginYIn: number;
  back: Box;
  spine: Box;
  front: Box;
  backSafe: Box;
  frontSafe: Box;
  /** Area for spine text (null when the spine must stay text-free). */
  spineText: Box | null;
}

export function coverLayout(args: { trim: TrimSize | { widthIn: number; heightIn: number }; widthIn: number; heightIn: number; spineIn: number; binding: Binding; spineText: boolean }): CoverLayout {
  const { trim, widthIn, heightIn, spineIn, binding } = args;
  const marginXIn = r4((widthIn - 2 * trim.widthIn - spineIn) / 2);
  const marginYIn = r4((heightIn - trim.heightIn) / 2);
  if (marginXIn < BLEED_IN - 0.001 || marginYIn < BLEED_IN - 0.001) {
    throw new Error(`Cover size ${widthIn} x ${heightIn} in is too small for two ${trim.widthIn} x ${trim.heightIn} in panels and a ${spineIn} in spine`);
  }
  const back: Box = { x: marginXIn, y: marginYIn, width: trim.widthIn, height: trim.heightIn };
  const spine: Box = { x: r4(marginXIn + trim.widthIn), y: marginYIn, width: spineIn, height: trim.heightIn };
  const front: Box = { x: r4(marginXIn + trim.widthIn + spineIn), y: marginYIn, width: trim.widthIn, height: trim.heightIn };
  const hinge = binding === "hardcover" ? HINGE_IN : 0;
  const inset = (b: Box, spineSide: "left" | "right"): Box => ({
    x: r4(b.x + SAFE_IN + (spineSide === "left" ? hinge : 0)),
    y: r4(b.y + SAFE_IN),
    width: r4(b.width - 2 * SAFE_IN - hinge),
    height: r4(b.height - 2 * SAFE_IN),
  });
  const textWidth = spineIn - 2 * SPINE_TEXT_MARGIN_IN;
  return {
    widthIn,
    heightIn,
    spineIn,
    marginXIn,
    marginYIn,
    back,
    spine,
    front,
    backSafe: inset(back, "right"),
    frontSafe: inset(front, "left"),
    spineText: args.spineText && textWidth > 0.1 ? { x: r4(spine.x + SPINE_TEXT_MARGIN_IN), y: r4(spine.y + SAFE_IN), width: r4(textWidth), height: r4(spine.height - 2 * SAFE_IN) } : null,
  };
}

function r4(n: number) {
  return Math.round(n * 10000) / 10000;
}
