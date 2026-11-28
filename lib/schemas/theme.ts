import { z } from "zod";
import { VOICE_IDS } from "./voices";

export const ART_STYLES = [
  "watercolor-storybook",
  "bold-comic",
  "soft-3d",
  "paper-cutout",
  "crayon",
  "whimsical-ink",
  "gentle-ink-wash",
  "painted-whimsy",
] as const;
export const ArtStyleSchema = z.enum(ART_STYLES);
export type ArtStyle = z.infer<typeof ArtStyleSchema>;

export const ART_STYLE_LABELS: Record<ArtStyle, string> = {
  "watercolor-storybook": "Watercolor storybook",
  "bold-comic": "Bold comic",
  "soft-3d": "Soft 3D animated",
  "paper-cutout": "Paper cutout",
  crayon: "Crayon",
  "whimsical-ink": "Whimsical ink",
  "gentle-ink-wash": "Gentle ink & wash",
  "painted-whimsy": "Hand-painted whimsy",
};

/**
 * Every new book and character uses the house art style, so a person's character is drawn
 * once and used in every book. Parents pick one of the base stories; each base story is a
 * built-in theme with its own world and characters (a theme with a houseOrder), so stories
 * never share characters. Books made earlier keep their theme and style.
 */
/** The first base story's world (The Wishing Garden, home of "Luma's Lost Glow"). */
export const HOUSE_THEME_ID = "wishing-garden";
export const HOUSE_STYLE: ArtStyle = "painted-whimsy";

/** Styles whose pages use the quiet "vignette" look: serif text on white, small pictures that fade into the page. */
export const VIGNETTE_STYLES: ReadonlySet<string> = new Set(["gentle-ink-wash", "painted-whimsy"]);

/** Vignette styles printed on warm cream paper instead of white (pictures fade into this color). */
export const PAPER_COLORS: Readonly<Record<string, string>> = { "painted-whimsy": "#fbf6ee" };

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #1E88E5");

export const CastMemberSchema = z.object({
  name: z.string().min(1).max(60),
  role: z.string().min(1).max(80),
  look: z.string().min(1).max(240),
});

export const ThemeConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and dashes only").min(2).max(60),
    name: z.string().min(2).max(60),
    ageRange: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(12)]),
    pitch: z.string().min(10).max(400),
    setting: z.string().min(10).max(400),
    /** Characters this world brings; a real-world story may have none. */
    supportingCast: z.array(CastMemberSchema).max(6),
    storyBeats: z.array(z.string().min(2).max(80)).min(4).max(12),
    powerIdeas: z.string().max(300).optional(),
    artDirection: z.object({
      defaultStyle: ArtStyleSchema,
      palette: z.array(hexColor).min(2).max(6),
      mood: z.string().min(2).max(200),
    }),
    contentRules: z.array(z.string().min(2).max(160)).max(12),
    genre: z.string().min(2).max(40).optional(),
    /**
     * Ready-made story ideas (problem, failed tries, the child's solution). Starting
     * from one makes the story plan quicker and more dependable; the story is still
     * written fresh around the child and everyone in it.
     */
    starters: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          title: z.string().min(2).max(60),
          idea: z.string().min(20).max(600),
          /** One or two sentences for the parent's story card (no spoilers). */
          summary: z.string().min(10).max(200).optional(),
          /** The voice this story is told in (the parent doesn't choose one). */
          voice: z.enum(VOICE_IDS).optional(),
          /** The one main trait the story builds, shown on the parent's story card ("Courage"). */
          trait: z.string().min(2).max(24).optional(),
        }),
      )
      .max(8)
      .optional(),
    /**
     * The parts family members can play, used only for the people the parent actually adds to a
     * book (see familyPartFor). The story itself never needs them, and never invents them.
     */
    familyParts: z
      .object({
        /** A grown-up from the family: a calm supporting part that never solves the problem. */
        grownUp: z.string().min(10).max(220).optional(),
        /** A child younger than the hero (a little brother, sister or cousin). */
        youngerChild: z.string().min(10).max(220).optional(),
        /** A child older than the hero. */
        olderChild: z.string().min(10).max(220).optional(),
        /** How the story reads when no grown-up is added: never an invented parent. */
        withoutGrownUp: z.string().min(10).max(220).optional(),
      })
      .optional(),
    /** Hidden themes aren't offered for new books (books already made with them keep working). */
    hidden: z.boolean().optional(),
    /** Set on the base stories parents pick from: their position in the list (1 first). */
    houseOrder: z.number().int().min(1).max(20).optional(),
    licensed: z.boolean().default(false),
  })
  .refine((t) => t.ageRange[0] <= t.ageRange[1], { message: "ageRange must be [min, max]", path: ["ageRange"] });

export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

export type FamilyParts = NonNullable<ThemeConfig["familyParts"]>;

/**
 * The part a family member plays in this base story, from who they are: a grown-up, or a child
 * younger or older than the hero. A part the parent typed for them always wins (the caller checks).
 */
export function familyPartFor(parts: FamilyParts | undefined, person: { kind: string; age?: number | null }, heroAge: number): string | undefined {
  if (!parts) return undefined;
  if (person.kind === "grownup") return parts.grownUp;
  if (person.age == null) return parts.youngerChild ?? parts.olderChild;
  return person.age < heroAge ? (parts.youngerChild ?? parts.olderChild) : (parts.olderChild ?? parts.youngerChild);
}

/** What the family parts ask for, for the parent's cast step ("a grown-up" and "a younger child"). */
export function familyPartLabels(parts: FamilyParts | undefined): string[] {
  if (!parts) return [];
  return [parts.grownUp && "a grown-up", parts.youngerChild && "a younger child", parts.olderChild && "an older child"].filter((x): x is string => !!x);
}

/** A base story: one ready-made story and the world (theme) it belongs to. */
export interface HouseStory<T = ThemeConfig> {
  theme: T;
  starter: NonNullable<ThemeConfig["starters"]>[number];
}

/**
 * The base stories parents pick from, in order: every starter of every visible theme with a
 * houseOrder. Works on theme configs or on DB listings (anything with a `config`).
 */
export function houseStories<T extends ThemeConfig | { config: ThemeConfig }>(themes: T[]): Array<HouseStory<T>> {
  const cfg = (t: T): ThemeConfig => ("config" in t ? t.config : t) as ThemeConfig;
  return themes
    .filter((t) => cfg(t).houseOrder !== undefined && !cfg(t).hidden)
    .sort((a, b) => (cfg(a).houseOrder ?? 0) - (cfg(b).houseOrder ?? 0))
    .flatMap((t) => (cfg(t).starters ?? []).map((starter) => ({ theme: t, starter })));
}
