import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SHIPPING } from "@/lib/legal/shipping";
import { TERMS } from "@/lib/legal/terms";
import type { LegalPage, LegalSection } from "@/lib/legal/types";

const pages: Array<[string, LegalPage]> = [
  ["shipping", SHIPPING],
  ["terms", TERMS],
];
const all = (s: LegalSection): LegalSection[] => [s, ...(s.sub ?? []).flatMap(all)];

describe.each(pages)("the %s page", (_name, page) => {
  const sections = page.sections.flatMap(all);
  const text = JSON.stringify(page);

  it("never has a comma in a heading, and never an em or en dash anywhere", () => {
    for (const h of [page.title, ...sections.map((s) => s.heading)]) expect(h, h).not.toContain(",");
    expect(text).not.toMatch(/[–—]/);
  });

  it("links only to pages that exist", () => {
    const hrefs = [...text.matchAll(/\]\((\/[a-z0-9/-]*)\)/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(fs.existsSync(`app${h}/page.tsx`), h).toBe(true);
  });

  it("lists every bracketed placeholder it still shows", () => {
    const shown = new Set([...text.matchAll(/\[([A-Z][A-Z ]+)\](?!\()/g)].map((m) => `[${m[1]}]`));
    expect([...shown].sort()).toEqual([...page.placeholders].sort());
  });
});

describe("the shipping page", () => {
  it("gives a relative price for every delivery option, never a dollar amount", () => {
    const table = SHIPPING.sections.find((s) => s.table)!.table!;
    expect(table.columns.at(-1)).toBe("Relative price");
    for (const row of table.rows) expect(row.at(-1)).toMatch(/^\$+$/);
    expect(JSON.stringify(SHIPPING)).not.toMatch(/\$\d/);
  });
});

describe("the terms page", () => {
  it("makes the customer responsible for content and the printer responsible for print quality", () => {
    expect(TERMS.lede).toMatch(/you are responsible for the photos and words you give us/);
    expect(TERMS.lede).toMatch(/Lulu, our print partner, is responsible for the quality of the printing/);
  });
});
