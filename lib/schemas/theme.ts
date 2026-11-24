import { z } from "zod";

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
    supportingCast: z.array(CastMemberSchema).min(1).max(6),
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
      .array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(2).max(60), idea: z.string().min(20).max(600) }))
      .max(4)
      .optional(),
    /** Hidden themes aren't offered for new books (books already made with them keep working). */
    hidden: z.boolean().optional(),
    licensed: z.boolean().default(false),
  })
  .refine((t) => t.ageRange[0] <= t.ageRange[1], { message: "ageRange must be [min, max]", path: ["ageRange"] });

export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;
