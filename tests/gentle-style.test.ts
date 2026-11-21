import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildIllustrationPrompt, STYLE_DESCRIPTIONS } from "@/lib/providers/image/prompt";
import { findProtectedNames } from "@/lib/safety/protectedNames";
import { VOICES } from "@/lib/schemas/voices";
import { BookPage, lookFor } from "@/components/book/BookPage";
import type { BookView, PageView } from "@/lib/books/viewTypes";

const scene = { action: "Oliver and Mama sit on a log", characters: ["Oliver"], setting: "a meadow", mood: "calm", framing: "wide", mustShow: ["Oliver and Mama on a log"], continuity: "" };
const base = { characterRef: null, bible: null, childName: "Oliver", scene, aspect: 1, textZone: "top" as const, palette: [], label: "Page 1" };

describe("Gentle ink & wash", () => {
  it("asks for a small vignette that fades into a white page, instead of a calm text area", () => {
    const p = buildIllustrationPrompt({ ...base, style: "gentle-ink-wash" });
    expect(p).toContain(STYLE_DESCRIPTIONS["gentle-ink-wash"]);
    expect(p).toMatch(/small, airy vignette/);
    expect(p).not.toMatch(/Keep the top third/);
    expect(buildIllustrationPrompt({ ...base, style: "crayon" })).toMatch(/Keep the top third/);
  });

  it("describes qualities, never the book, its characters, author or illustrator", () => {
    for (const text of [STYLE_DESCRIPTIONS["gentle-ink-wash"], JSON.stringify(VOICES["quiet-wisdom"])]) {
      expect(text).not.toMatch(/pooh|milne|shepard|piglet|eeyore|hundred acre|disney/i);
      expect(findProtectedNames(text)).toEqual([]);
    }
  });

  it("blocks the famous bear and friends, and suggests the original Quiet Meadow theme", () => {
    for (const name of ["Winnie the Pooh", "Pooh Bear", "Eeyore", "Hundred Acre Wood", "A. A. Milne"]) {
      const hit = findProtectedNames(`a story with ${name}`);
      expect(hit.length).toBeGreaterThan(0);
      expect(hit[0].suggestedThemeIds).toContain("quiet-meadow");
    }
    // An everyday word is fine.
    expect(findProtectedNames("a little piglet in the barn")).toEqual([]);
  });

  it("pages use the vignette look: serif words on top, the picture below", () => {
    expect(lookFor("gentle-ink-wash")).toBe("vignette");
    expect(lookFor("crayon")).toBe("classic");
    const book = { trim: { id: "square-8.5", widthIn: 8.5, heightIn: 8.5 }, style: "gentle-ink-wash", palette: ["#B8925A"], readingLevel: "4-6" } as unknown as BookView;
    const page = { kind: "story", layout: "fullBleed", textZone: "top", text: "What does brave feel like?", number: 3, storyNumber: 1, imageUrl: "x.png", imageStatus: "ready", half: null } as unknown as PageView;
    const html = renderToStaticMarkup(createElement(BookPage, { page, book, mode: "print" }));
    expect(html).toContain('data-look="vignette"');
    expect(html).toContain("bk-text-vignette");
    expect(html).toMatch(/object-fit:contain/);
  });
});
