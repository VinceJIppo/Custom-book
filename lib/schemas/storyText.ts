import type { ReadingLevel } from "./book";
import type { VoiceId } from "./voices";

/**
 * Rules for the words that get printed in a book: line lengths for verse,
 * and no long dashes. Used to send drafts back and to clean final text.
 */

interface VerseShape {
  /** Most words allowed on one line of verse. */
  maxWordsPerLine: number;
  /** Most lines of verse on one page. */
  maxLines: number;
}

/** Verse limits per voice and reading level; null means prose (no line limits). */
const VERSE: Partial<Record<VoiceId, Partial<Record<ReadingLevel, VerseShape>>>> = {
  "rhyming-mischief": {
    "2-4": { maxWordsPerLine: 8, maxLines: 2 },
    "4-6": { maxWordsPerLine: 10, maxLines: 4 },
  },
};

export function verseShape(voice: VoiceId | undefined, level: ReadingLevel): VerseShape | null {
  return (voice && VERSE[voice]?.[level]) || null;
}

function words(line: string): number {
  return line.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** Problems with verse length, phrased as instructions for a redraft. */
export function verseProblems(pages: Array<{ pageNumber: number; text: string }>, voice: VoiceId | undefined, level: ReadingLevel): string[] {
  const shape = verseShape(voice, level);
  if (!shape) return [];
  const problems: string[] = [];
  for (const p of pages) {
    const lines = p.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > shape.maxLines) problems.push(`Page ${p.pageNumber} has ${lines.length} lines; use at most ${shape.maxLines}.`);
    lines.forEach((line, i) => {
      const n = words(line);
      if (n > shape.maxWordsPerLine) problems.push(`Page ${p.pageNumber}, line ${i + 1} has ${n} words; keep every line to ${shape.maxWordsPerLine} words or fewer: ${JSON.stringify(line)}`);
    });
  }
  return problems.slice(0, 12);
}

/**
 * Replaces long dashes (em and en dashes) with plain punctuation: a dash that
 * trails off before a question mark, quote or line end becomes "...", a dash
 * that starts a line is dropped, and any other dash becomes a comma.
 */
export function cleanDashes(text: string): string {
  const dash = "[\\u2014\\u2013]";
  return text
    .replace(new RegExp(`^[ \\t]*${dash}[ \\t]*`, "gm"), "")
    .replace(new RegExp(`[ \\t]*${dash}[ \\t]*(?=[?!'"\\u2019\\u201d]|$)`, "gm"), "...")
    .replace(new RegExp(`([!?.])[ \\t]*${dash}[ \\t]*`, "g"), "$1 ")
    .replace(new RegExp(`[ \\t]*${dash}[ \\t]*`, "g"), ", ")
    .replace(/,\s*([,.!?;:])/g, "$1")
    .replace(/[ \t]+$/gm, "");
}
