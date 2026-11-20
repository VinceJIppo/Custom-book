import type { ModerationProvider, ModerationResult } from "./types";

/**
 * Offline moderation: a small word list that keeps parent free text G-rated.
 * A model-based moderation adapter replaces this in Phase 2.
 */
const BLOCKED = [
  "kill", "murder", "blood", "gore", "gun", "rifle", "pistol", "knife", "stab", "shoot", "bomb", "explode",
  "drunk", "beer", "wine", "vodka", "cigarette", "vape", "drug", "naked", "nude", "sexy", "sex",
  "hate", "stupid", "idiot", "dumb", "shut up", "die", "dead", "corpse", "zombie", "demon", "devil", "horror",
  "damn", "hell", "crap",
];

const MESSAGE = "Let's keep it gentle: StoryStar books stay G-rated, so please rephrase without scary, violent or grown-up words.";

export class MockModerationProvider implements ModerationProvider {
  readonly name = "mock";
  async check(text: string): Promise<ModerationResult> {
    const lower = ` ${text.toLowerCase().replace(/[^a-z\s']/g, " ")} `;
    const hits = BLOCKED.filter((w) => lower.includes(` ${w} `) || lower.includes(` ${w}s `));
    return hits.length ? { ok: false, message: MESSAGE, categories: hits } : { ok: true, categories: [] };
  }
}
