import { describe, expect, it } from "vitest";
import { cleanDashes, verseProblems, verseShape } from "@/lib/schemas/storyText";

describe("long dashes are removed from printed words", () => {
  it.each([
    ["Zizzle bounced in—polka-dot paws, spiral tail—and sang,", "Zizzle bounced in, polka-dot paws, spiral tail, and sang,"],
    ["'A sock sneezed ah-ah-ah—?' 'CHOO!'", "'A sock sneezed ah-ah-ah...?' 'CHOO!'"],
    ["whoosh round the top—\nand they bumped", "whoosh round the top...\nand they bumped"],
    ["'No giggling! Very Serious Day!—that's what I said.", "'No giggling! Very Serious Day! that's what I said."],
    ["the long cord – plunk – went nowhere", "the long cord, plunk, went nowhere"],
    ["—And then the bell rang.", "And then the bell rang."],
    ["Spring-wheeled, loop-the-loop: hyphens stay.", "Spring-wheeled, loop-the-loop: hyphens stay."],
  ])("%s", (input, expected) => {
    expect(cleanDashes(input)).toBe(expected);
  });
});

describe("verse line limits", () => {
  it("apply only to rhyming verse for ages 2 to 6", () => {
    expect(verseShape("rhyming-mischief", "2-4")).toEqual({ maxWordsPerLine: 8, maxLines: 2 });
    expect(verseShape("rhyming-mischief", "4-6")).toEqual({ maxWordsPerLine: 10, maxLines: 4 });
    expect(verseShape("rhyming-mischief", "6-8")).toBeNull();
    expect(verseShape("classic", "4-6")).toBeNull();
    expect(verseShape(undefined, "4-6")).toBeNull();
  });
  it("names the page, line and limit", () => {
    const pages = [
      { pageNumber: 1, text: "Oliver woke in moon pajamas and gasped at the sight:\nhis bed on the ceiling, the whole town upside-down in the morning light!" },
      { pageNumber: 2, text: "One\nTwo\nThree\nFour\nFive" },
      { pageNumber: 3, text: "Short and bouncy,\nhappy and flouncy." },
    ];
    const p = verseProblems(pages, "rhyming-mischief", "4-6");
    expect(p).toContain("Page 2 has 5 lines; use at most 4.");
    expect(p.some((x) => x.startsWith("Page 1, line 2 has 13 words; keep every line to 10 words or fewer"))).toBe(true);
    expect(p.some((x) => x.startsWith("Page 1, line 1"))).toBe(false); // 10 words is fine
    expect(p.some((x) => x.startsWith("Page 3"))).toBe(false);
    expect(verseProblems(pages, "classic", "4-6")).toEqual([]);
  });
});
