import { describe, expect, it } from "vitest";
import { CATALOG, luluSpineWidthIn, spineTextAllowed } from "@/lib/print/products";
import { coverLayout, HINGE_IN } from "@/lib/print/cover";
import { getTrim } from "@/lib/print/geometry";

describe("Lulu product catalog", () => {
  it("uses dotted POD package IDs that match each product", () => {
    for (const p of CATALOG) {
      const parts = p.luluSku.split(".");
      expect(parts).toHaveLength(6);
      expect(parts[1]).toBe("FC");
      expect(parts[3]).toBe(p.binding === "hardcover" ? "CW" : "PB");
      const t = getTrim(p.trimSize);
      const code = `${String(Math.round(t.widthIn * 100)).padStart(4, "0")}X${String(Math.round(t.heightIn * 100)).padStart(4, "0")}`;
      expect(parts[0]).toBe(code);
    }
  });
  it("follows Lulu's page minimums (hardcover 24, paperback 32)", () => {
    expect(CATALOG.find((p) => p.id === "hardcover-square-8.5")?.pageRules.minPages).toBe(24);
    expect(CATALOG.find((p) => p.id === "softcover-square-8.5")?.pageRules.minPages).toBe(32);
  });
});

describe("spine width (Lulu Book Creation Guide)", () => {
  it("hardcover uses the table", () => {
    expect(luluSpineWidthIn("hardcover", 24)).toBe(0.25);
    expect(luluSpineWidthIn("hardcover", 84)).toBe(0.25);
    expect(luluSpineWidthIn("hardcover", 85)).toBe(0.5);
    expect(luluSpineWidthIn("hardcover", 200)).toBe(0.75);
    expect(luluSpineWidthIn("hardcover", 800)).toBe(2.125);
    expect(() => luluSpineWidthIn("hardcover", 20)).toThrow();
  });
  it("paperback uses pages / 444 + 0.06 in", () => {
    expect(luluSpineWidthIn("softcover", 32)).toBeCloseTo(32 / 444 + 0.06, 3);
  });
  it("allows spine text only above 80 pages", () => {
    expect(spineTextAllowed(80)).toBe(false);
    expect(spineTextAllowed(81)).toBe(true);
  });
});

describe("wraparound cover layout", () => {
  const trim = getTrim("square-8.5");
  it("places back, spine and front symmetrically inside the provider's size", () => {
    const l = coverLayout({ trim, widthIn: 18.75, heightIn: 10, spineIn: 0.25, binding: "hardcover", spineText: false });
    expect(l.marginXIn).toBe(0.75);
    expect(l.marginYIn).toBe(0.75);
    expect(l.back.x).toBe(0.75);
    expect(l.spine).toMatchObject({ x: 9.25, width: 0.25 });
    expect(l.front.x).toBe(9.5);
    expect(l.front.x + l.front.width + l.marginXIn).toBeCloseTo(18.75);
    // Hardcover: extra keep-out at the hinge, next to the spine.
    expect(l.frontSafe.x).toBeCloseTo(9.5 + 0.5 + HINGE_IN);
    expect(l.frontSafe.x + l.frontSafe.width).toBeCloseTo(9.5 + 8.5 - 0.5);
    expect(l.spineText).toBeNull();
  });
  it("adds a spine text area only when allowed and wide enough", () => {
    const l = coverLayout({ trim, widthIn: 19.25, heightIn: 10, spineIn: 0.75, binding: "hardcover", spineText: true });
    expect(l.spineText?.width).toBeCloseTo(0.5);
  });
  it("rejects sizes too small for the panels", () => {
    expect(() => coverLayout({ trim, widthIn: 17, heightIn: 8.5, spineIn: 0.25, binding: "softcover", spineText: false })).toThrow();
  });
});
