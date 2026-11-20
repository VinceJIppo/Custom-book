import { describe, expect, it } from "vitest";
import {
  BLEED_IN,
  bindingSide,
  coverSpreadSizeIn,
  fullBleedPx,
  getTrim,
  illustrationTargetPx,
  isRecto,
  pageSizeWithBleed,
  safeBox,
} from "@/lib/print/geometry";

const square = getTrim("square-8.5");
const portrait = getTrim("portrait-8x10");

describe("page size with bleed", () => {
  it("adds 0.125 in on every side", () => {
    expect(BLEED_IN).toBe(0.125);
    expect(pageSizeWithBleed(square)).toEqual({ widthIn: 8.75, heightIn: 8.75 });
    expect(pageSizeWithBleed(portrait)).toEqual({ widthIn: 8.25, heightIn: 10.25 });
  });
  it("needs 2625 x 2625 px for a full-bleed default page at 300 ppi", () => {
    expect(fullBleedPx(square)).toEqual({ widthPx: 2625, heightPx: 2625 });
    expect(fullBleedPx(portrait)).toEqual({ widthPx: 2475, heightPx: 3075 });
  });
});

describe("page sides and safe area", () => {
  it("page 1 is a right-hand page bound on the left", () => {
    expect(isRecto(1)).toBe(true);
    expect(isRecto(2)).toBe(false);
    expect(bindingSide(1)).toBe("left");
    expect(bindingSide(2)).toBe("right");
    expect(() => isRecto(0)).toThrow();
  });
  it("keeps 0.5 in from trim, plus gutter on the binding side", () => {
    const r = safeBox(square, 1); // recto: gutter on the left
    expect(r.x).toBeCloseTo(0.125 + 0.5 + 0.25);
    expect(r.y).toBeCloseTo(0.625);
    expect(r.x + r.width).toBeCloseTo(8.75 - 0.625);
    const v = safeBox(square, 2); // verso: gutter on the right
    expect(v.x).toBeCloseTo(0.625);
    expect(v.x + v.width).toBeCloseTo(8.75 - 0.875);
    expect(r.width).toBeCloseTo(v.width);
  });
});

describe("illustration targets", () => {
  it("spreads cover two trims plus outer bleeds", () => {
    expect(illustrationTargetPx("spread", square)).toMatchObject({ widthPx: 5175, heightPx: 2625 });
    expect(illustrationTargetPx("fullBleed", square).aspect).toBe(1);
  });
});

describe("cover spread", () => {
  it("is back + spine + front + wraps", () => {
    expect(coverSpreadSizeIn(square, 0.5, 0.75)).toEqual({ widthIn: 19, heightIn: 10 }) // 8.5 + 8.5 + 0.5 spine + 2 x 0.75 wrap;
  });
});
