/**
 * Story setup: the opening of the book, before the adventure starts.
 *
 * Picture book craft (editors and craft guides agree on the shape, if not the
 * exact page numbers):
 * - Open on the hero in their everyday world, showing what they love or want,
 *   so the reader cares before anything goes wrong.
 * - Then a "One day..." disruption with a cause a child can follow.
 * - Make it personal: why this matters to this hero, and why they (not a
 *   grown-up) have to act, with the easy fix ruled out.
 * - The hero chooses to go. The problem is clear by about a quarter of the way in
 *   (in a 32-page book, by pages 8 or 9 at the latest), so the opening is short
 *   but never skipped.
 */
import type { z } from "zod";
import type { Outline, OutlineBeatSchema, StorySetup } from "../schemas/story";

type OutlineBeat = z.infer<typeof OutlineBeatSchema>;

/** Pages given to the opening: about a quarter of the story, at least 2 (12 pages: 3; 16: 4; 24: 6). */
export function setupPageCount(storyPages: number): number {
  return Math.min(6, Math.max(2, Math.round(storyPages / 4)));
}

/** Plain-English problems with a setup plan (empty when it fits the book). */
export function setupProblems(setup: StorySetup, storyPages: number): string[] {
  const k = setupPageCount(storyPages);
  const problems: string[] = [];
  if (setup.journeyStartsOnPage !== k + 1) problems.push(`journeyStartsOnPage must be ${k + 1}: the opening is pages 1 to ${k}.`);
  const nums = setup.openingPages.map((p) => p.pageNumber);
  const want = Array.from({ length: k }, (_, i) => i + 1);
  if (nums.join(",") !== want.join(",")) problems.push(`openingPages must be exactly pages ${want.join(", ")} in order (got ${nums.join(", ") || "none"}).`);
  const missing = setup.openingPages.filter((p) => p.pageNumber > 1 && !p.causeFromPrevious.trim()).map((p) => p.pageNumber);
  if (missing.length) problems.push(`Give causeFromPrevious for opening pages ${missing.join(", ")}.`);
  // The setup agent re-plans every page so the opening and the adventure fit together.
  if (setup.pages) {
    const all = setup.pages.map((p) => p.pageNumber);
    const every = Array.from({ length: storyPages }, (_, i) => i + 1);
    if (all.join(",") !== every.join(",")) problems.push(`pages must be every page, 1 to ${storyPages}, in order (got ${all.length}).`);
    const noLink = setup.pages.filter((p) => p.pageNumber > 1 && !p.causeFromPrevious.trim()).map((p) => p.pageNumber);
    if (noLink.length) problems.push(`Give causeFromPrevious for pages ${noLink.join(", ")}.`);
    const opening = setup.pages.slice(0, k).map((p) => `${p.pageNumber}:${p.summary}`).join("|");
    const planned = setup.openingPages.map((p) => `${p.pageNumber}:${p.summary}`).join("|");
    if (opening !== planned) problems.push(`pages 1 to ${k} must be the same as openingPages.`);
  }
  // The disruption shouldn't be on page 1: the reader meets the hero's world first.
  if (/^\s*one day/i.test(setup.openingPages[0]?.summary ?? "")) problems.push("Page 1 shows the hero's everyday world; save the \"One day...\" disruption for a later opening page.");
  return problems;
}

/**
 * The spine with the planned opening. When the setup agent re-planned every page
 * (newer plans), those pages replace the spine's; otherwise pages 1..k are
 * replaced and the rest kept.
 */
export function applySetup(outline: Outline, setup: StorySetup): Outline {
  if (setup.pages?.length === outline.pages.length) return { ...outline, setup, pages: setup.pages };
  const k = setup.openingPages.length;
  const later: OutlineBeat[] = outline.pages.filter((p) => p.pageNumber > k);
  // The first adventure page now follows from the hero's decision.
  const first = later[0];
  const linked = first ? [{ ...first, causeFromPrevious: first.causeFromPrevious || `Because ${setup.decision.charAt(0).toLowerCase()}${setup.decision.slice(1)}` }, ...later.slice(1)] : later;
  return { ...outline, setup, pages: [...setup.openingPages, ...linked] };
}
