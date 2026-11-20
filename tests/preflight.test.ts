import { describe, expect, it } from "vitest";
import { runPreflight, type PreflightInput } from "@/lib/print/preflight";
import { planPadding } from "@/lib/print/padding";
import type { BookView, PageView } from "@/lib/books/viewTypes";
import type { PdfInspection } from "@/lib/print/pdfInspect";

const rules = { minPages: 24, maxPages: 800, multiple: 2 };

function view(over: Partial<PageView> = {}): BookView {
  const pages: PageView[] = Array.from({ length: 24 }, (_, i) => ({
    number: i + 1,
    side: i % 2 === 0 ? "recto" : "verso",
    layout: "fullBleed",
    pageId: i < 21 ? `p${i}` : null,
    kind: i >= 3 && i < 19 ? "story" : "endpaper",
    text: "",
    textZone: "bottom",
    imageUrl: "x",
    imageStatus: "ready",
    storyNumber: null,
    ...(i === 5 ? over : {}),
  }));
  return { id: "b", title: "T", childName: "C", themeName: "Th", voiceLabel: "Classic storybook", style: "crayon", status: "ready", trim: { id: "square-8.5", widthIn: 8.5, heightIn: 8.5 }, palette: ["#000000"], readingLevel: "4-6", cover: { imageUrl: "c", imageStatus: "ready" }, backBlurb: "", pages, warnings: [], contentKey: "k" };
}

const goodPdf = (pages = 24, w = 8.75, h = 8.75): PdfInspection => ({
  pageCount: pages,
  pageSizesIn: Array.from({ length: pages }, () => ({ width: w, height: h })),
  encrypted: false,
  fonts: [{ name: "ABC+Andika", embedded: true, subtype: "CIDFontType2" }],
  transparency: [],
  imageCount: 16,
});

function input(over: Partial<PreflightInput> = {}, v = view()): PreflightInput {
  return {
    view: v,
    productLabel: "Hardcover",
    pageRules: rules,
    padding: planPadding(21, rules),
    interior: { inspection: goodPdf(), textIssues: [], images: [{ page: 4, key: "a.png", ppi: 320, placeholder: false }] },
    cover: { inspection: goodPdf(1, 18.75, 10), textIssues: [], images: [], expectedWidthIn: 18.75, expectedHeightIn: 10, spineTextAllowed: false, hasSpineText: false },
    ...over,
  };
}

const codes = (r: ReturnType<typeof runPreflight>, level: string) => r.items.filter((i) => i.level === level).map((i) => i.code);

describe("preflight", () => {
  it("passes a good book", () => {
    const r = runPreflight(input());
    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.items.every((i) => i.message.length > 10)).toBe(true);
  });

  it("errors on wrong page sizes, missing art, low resolution and overflow", () => {
    const base = input();
    expect(codes(runPreflight({ ...base, interior: { ...base.interior, inspection: goodPdf(24, 8.5, 8.5) } }), "error")).toContain("page-size");
    expect(codes(runPreflight(input({}, view({ imageUrl: null, kind: "story" }))), "error")).toContain("missing-art");
    expect(codes(runPreflight({ ...base, interior: { ...base.interior, images: [{ page: 4, key: "a.png", ppi: 150, placeholder: false }] } }), "error")).toContain("resolution");
    const overflow = runPreflight({ ...base, interior: { ...base.interior, textIssues: [{ page: 7, kind: "overflow", text: "Once upon" }] } });
    expect(overflow.ok).toBe(false);
    expect(overflow.items[0]).toMatchObject({ level: "error", code: "text-fit", page: 7 });
    expect(codes(runPreflight({ ...base, interior: { ...base.interior, textIssues: [{ page: 7, kind: "outsideSafeArea", text: "x" }] } }), "error")).toContain("safe-area");
  });

  it("errors on unembedded fonts, encryption, wrong cover size, spine text on thin books, and page counts", () => {
    const base = input();
    expect(codes(runPreflight({ ...base, cover: { ...base.cover, inspection: { ...goodPdf(1, 18.75, 10), fonts: [{ name: "Helvetica", embedded: false, subtype: "Type1" }] } } }), "error")).toContain("fonts");
    expect(codes(runPreflight({ ...base, interior: { ...base.interior, inspection: { ...goodPdf(), encrypted: true } } }), "error")).toContain("security");
    expect(codes(runPreflight({ ...base, cover: { ...base.cover, expectedWidthIn: 19 } }), "error")).toContain("cover-size");
    expect(codes(runPreflight({ ...base, cover: { ...base.cover, hasSpineText: true } }), "error")).toContain("spine");
    expect(codes(runPreflight({ ...base, padding: planPadding(900, rules) }), "error")).toContain("page-count");
    expect(codes(runPreflight({ ...base, interior: { ...base.interior, inspection: goodPdf(23) } }), "error")).toContain("page-count");
  });

  it("warns (without blocking) on soft images, placeholders, flagged likeness, transparency and estimated cover sizes", () => {
    const base = input({}, view({ imageStatus: "flagged" }));
    const r = runPreflight({
      ...base,
      interior: { ...base.interior, images: [{ page: 4, key: "a.png", ppi: 250, placeholder: false }, { page: 5, key: "b.svg", ppi: 350, placeholder: true }], inspection: { ...goodPdf(), transparency: ["a soft mask"] } },
      cover: { ...base.cover, approximate: true },
    });
    expect(r.ok).toBe(true);
    expect(codes(r, "warning").sort()).toEqual(["cover-size", "likeness", "placeholder", "resolution", "transparency"]);
  });
});
