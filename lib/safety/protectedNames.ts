import data from "./protected-names.json";

/**
 * Checks free text for trademarked or copyrighted characters and franchises.
 * On a match we explain and suggest original themes; we never rewrite the
 * request into a lookalike of the protected character.
 */
interface Entry {
  name: string;
  aliases?: string[];
  phraseOnly?: string[];
  genre: string;
}

const GENRE_THEMES: Record<string, { label: string; themes: string[] }> = {
  superheroes: { label: "superhero", themes: ["superhero-squad"] },
  space: { label: "space", themes: ["space-explorer"] },
  dinosaurs: { label: "playful animal", themes: ["dinosaur-valley", "ocean-deep"] },
  ocean: { label: "ocean", themes: ["ocean-deep"] },
  fantasy: { label: "fantasy", themes: ["dragon-knight", "space-explorer"] },
  vehicles: { label: "building and vehicle", themes: ["construction-crew"] },
  whimsical: { label: "whimsical, rhyming", themes: ["topsy-turvy-town"] },
  gentle: { label: "gentle, thoughtful", themes: ["quiet-meadow"] },
};

export interface ProtectedMatch {
  name: string;
  matched: string;
  genre: string;
  suggestedThemeIds: string[];
  message: string;
}

/** Lowercase, strip accents and punctuation, collapse spaces, pad with spaces for whole-word matching. */
export function normalize(text: string): string {
  return ` ${text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]s\b/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Same as normalize but with all spaces removed, to catch "spider man" vs "spiderman". */
function squash(text: string) {
  return normalize(text).replace(/ /g, "");
}

interface Compiled {
  entry: Entry;
  terms: Array<{ raw: string; spaced: string; squashed: string }>;
}

const compiled: Compiled[] = (data.entries as Entry[]).map((entry) => {
  const raws = entry.phraseOnly ? [...(entry.aliases ?? []), ...entry.phraseOnly] : [entry.name, ...(entry.aliases ?? [])];
  return { entry, terms: raws.map((raw) => ({ raw, spaced: normalize(raw), squashed: squash(raw) })) };
});

export function findProtectedNames(text: string, opts: { allow?: string[] } = {}): ProtectedMatch[] {
  if (!text?.trim()) return [];
  const allowed = new Set((opts.allow ?? []).map((a) => normalize(a)));
  const spaced = normalize(text);
  const words = spaced.trim().split(" ");
  const matches: ProtectedMatch[] = [];
  for (const { entry, terms } of compiled) {
    for (const term of terms) {
      if (allowed.has(term.spaced)) continue;
      let hit = spaced.includes(term.spaced);
      if (!hit && term.squashed.length >= 6) {
        // Catch joined or split spellings across up to 3 adjacent words.
        for (let i = 0; i < words.length && !hit; i++) {
          let joined = "";
          for (let j = i; j < Math.min(words.length, i + 3); j++) {
            joined += words[j];
            if (joined === term.squashed) hit = true;
          }
        }
      }
      if (hit) {
        matches.push(buildMatch(entry, term.raw));
        break;
      }
    }
  }
  return matches;
}

function buildMatch(entry: Entry, matched: string): ProtectedMatch {
  const g = GENRE_THEMES[entry.genre] ?? GENRE_THEMES.fantasy;
  return {
    name: entry.name,
    matched,
    genre: entry.genre,
    suggestedThemeIds: g.themes,
    message: `We can't use ${entry.name} in a StoryStar book because it's a trademarked character or franchise, and printers can't print it without a license. Our original ${g.label} themes are a great fit instead, and your child is the star!`,
  };
}

/** Check several fields; returns the first problem in plain English, or null. */
export function checkFieldsForProtectedNames(
  fields: Record<string, string | string[] | undefined | null>,
  opts: { allow?: string[] } = {},
): { field: string; match: ProtectedMatch } | null {
  for (const [field, value] of Object.entries(fields)) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const v of values) {
      const m = findProtectedNames(v, opts);
      if (m.length) return { field, match: m[0] };
    }
  }
  return null;
}
