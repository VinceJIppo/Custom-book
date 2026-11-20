import { describe, expect, it } from "vitest";
import { planPadding, paddingKinds } from "@/lib/print/padding";
import { paginate, type LogicalPageRef } from "@/lib/books/paginate";

const rules = { minPages: 24, maxPages: 800, multiple: 2 };

describe("planPadding", () => {
  it("pads up to the minimum", () => {
    expect(planPadding(20, rules)).toMatchObject({ totalPages: 24, padPages: 4, problems: [] });
  });
  it("rounds up to the multiple", () => {
    expect(planPadding(25, rules)).toMatchObject({ totalPages: 26, padPages: 1 });
    expect(planPadding(26, { minPages: 24, maxPages: 800, multiple: 4 })).toMatchObject({ totalPages: 28, padPages: 2 });
  });
  it("reports books over the maximum in plain English", () => {
    const p = planPadding(41, { minPages: 24, maxPages: 40, multiple: 2 });
    expect(p.problems[0]).toMatch(/at most 40/);
  });
  it("rejects nonsense input", () => {
    expect(() => planPadding(-1, rules)).toThrow();
    expect(() => planPadding(10, { minPages: 24, maxPages: 10, multiple: 2 })).toThrow();
  });
  it("uses designed pages, never blanks", () => {
    expect(paddingKinds(4)).toEqual(["drawYourOwn", "endpaper", "endpaper", "endpaper"]);
    expect(paddingKinds(1)).toEqual(["endpaper"]);
  });
});

function book(layouts: string[]): LogicalPageRef[] {
  const front = [
    { id: "b", kind: "belongsTo", layout: "belongsTo" },
    { id: "d", kind: "dedication", layout: "dedication" },
    { id: "t", kind: "title", layout: "title" },
  ];
  const story = layouts.map((l, i) => ({ id: `s${i + 1}`, kind: "story", layout: l }));
  return [...front, ...story, { id: "e", kind: "theEnd", layout: "theEnd" }] as LogicalPageRef[];
}

describe("paginate", () => {
  it("16-page story with no spreads becomes 20 content pages padded to 24", () => {
    const r = paginate(book(Array(16).fill("fullBleed")), rules);
    expect(r.pages).toHaveLength(24);
    expect(r.padding.padPages).toBe(4);
    expect(r.pages[0]).toMatchObject({ number: 1, side: "recto", pageId: "b" });
    expect(r.pages.slice(-4).every((p) => p.pageId === null)).toBe(true);
  });
  it("a spread on a left-hand page takes two facing pages", () => {
    const layouts = Array(16).fill("fullBleed");
    layouts[0] = "spread"; // story page 1 lands on physical page 4 (verso)
    const r = paginate(book(layouts), rules);
    expect(r.pages[3]).toMatchObject({ number: 4, side: "verso", pageId: "s1", half: "left" });
    expect(r.pages[4]).toMatchObject({ number: 5, side: "recto", pageId: "s1", half: "right" });
    expect(r.warnings).toEqual([]);
  });
  it("a spread that would start on a right-hand page falls back to full-bleed with a warning", () => {
    const layouts = Array(16).fill("fullBleed");
    layouts[1] = "spread"; // story page 2 lands on physical page 5 (recto)
    const r = paginate(book(layouts), rules);
    expect(r.pages[4]).toMatchObject({ number: 5, layout: "fullBleed", degradedFrom: "spread" });
    expect(r.warnings[0]).toMatch(/right-hand page/);
  });
  it("total is always valid for the product", () => {
    for (const n of [12, 16, 20, 24]) {
      const total = paginate(book(Array(n).fill("imageTop")), rules).pages.length;
      expect(total).toBeGreaterThanOrEqual(24);
      expect(total % 2).toBe(0);
    }
  });
});
