/**
 * Provider-neutral prompt text for illustrations. Every image adapter builds
 * its request from these strings so behavior stays consistent across providers.
 */
import { VIGNETTE_STYLES, type ArtStyle } from "../../schemas/theme";
import type { CharacterBible, TextZone } from "../../schemas/story";
import type { IllustrationRequest } from "./types";
import { HAIR_LENGTHS, type HairLength } from "../../schemas/child";

export const STYLE_DESCRIPTIONS: Record<ArtStyle, string> = {
  "watercolor-storybook":
    "classic children's picture book watercolor illustration: soft washes, visible paper texture, gentle ink outlines, warm natural light",
  "bold-comic":
    "bold, bright children's comic book illustration: clean thick outlines, flat saturated colors, simple cel shading, dynamic but friendly poses",
  "soft-3d":
    "soft 3D animated film look for young children: rounded shapes, smooth matte materials, gentle global illumination, expressive big eyes",
  "paper-cutout":
    "layered paper cutout collage illustration: cut construction paper shapes, subtle drop shadows between layers, visible paper grain",
  crayon:
    "hand-drawn crayon and colored pencil illustration as a talented child might draw: waxy strokes, textured fills, cheerful and loose",
  "gentle-ink-wash":
    "gentle classic picture-book illustration: fine, slightly sketchy pencil-and-ink outlines drawn with few lines, soft muted watercolor washes in honey, sage green, dusty rose and soft grey, delicate leafy branches and simple tufts of grass, tender understated expressions, quiet and calm; a small vignette scene on plain white paper whose edges fade softly into the white with no border, frame or background fill",
  "painted-whimsy":
    "delicate hand-painted children's book illustration in gouache and soft watercolor with fine colored-pencil linework, a nostalgic vintage-storybook feeling of childlike wonder: a soft, dreamy pastel palette of blush pink, butter yellow, powder blue, mint and cream with small touches of rose red; rosy cheeks and tiny painted freckles; dainty florals, ribbons, bows, gingham and polka dots; tiny magical details everywhere to discover (wildflowers, strawberries, little stars, teacups, butterflies, lace); gentle glowing light and visible brush and paper texture; sweet, tender and a little enchanted; the scene floats on warm cream paper with soft painterly edges that fade into the paper, no border or frame",
  "whimsical-ink":
    "whimsical, surreal and energetic hand-drawn picture-book illustration: loose, lively pen-and-ink linework with a slightly shaky, scratchy hand-drawn quality and visible pencil-like texture, filled with flat watercolor-style colors from a small bright palette and plenty of white paper; almost no straight lines or right angles anywhere: buildings lean, bulge and droop, towers corkscrew and wobble, roads loop and stairs curl, hills swell like waves, everything has a bouncy, slightly unstable, off-kilter energy; characters are exaggerated and rubbery with rounded or droopy bodies, long bendy limbs, floppy shapes and big expressive faces, including friendly made-up creatures with hybrid, humanlike traits; surreal, absurd settings and impossible contraptions full of pipes, gears, springs, balloons and odd gadgets; playful tilted perspective and lots of motion",
};

export const NO_TEXT_RULE =
  "Absolutely no text, no letters, no numbers, no words, no captions, no speech bubbles, no signs with words, no logos, no watermarks.";

export const SAFETY_RULE =
  "Wholesome and G-rated for young children. Nothing scary, violent or unsafe. Only original characters; no trademarked or copyrighted characters.";

const ZONE_SPACE: Record<TextZone, string> = {
  top: "Keep the top third of the image calm and uncluttered (open sky, a plain wall or soft background) with no faces or important details there, because text will be placed over it.",
  bottom:
    "Keep the bottom third of the image calm and uncluttered (open ground, grass, floor or water) with no faces or important details there, because text will be placed over it.",
  left: "Keep the left third of the image calm and uncluttered with no faces or important details there, because text will be placed over it. Put the main action in the right two thirds.",
  right:
    "Keep the right third of the image calm and uncluttered with no faces or important details there, because text will be placed over it. Put the main action in the left two thirds.",
};

export function describeBible(name: string, b: CharacterBible): string {
  const parts = [
    `hair: ${b.hair}`,
    `eyes: ${b.eyes}`,
    `skin tone: ${b.skinTone}`,
    `face: ${b.faceShape}`,
    `glasses: ${b.glasses || "none"}`,
    `freckles: ${b.freckles || "none"}`,
    `outfit: ${b.signatureOutfit}`,
  ];
  if (b.otherDetails) parts.push(b.otherDetails);
  return `${name} (the hero, a young child) must look exactly like the character in the reference image: ${parts.join("; ")}.`;
}

/** One line per other real person: which attached sheet is theirs, or how they look. */
function castLines(req: IllustrationRequest): string[] {
  let n = req.characterRef ? 1 : 0;
  const ordinal = (i: number) => ["first", "second", "third", "fourth", "fifth"][i] ?? `#${i + 1}`;
  return (req.cast ?? []).map((c) => {
    const base = c.bible ? describeBible(c.name, c.bible).replace(/^.*?: /, "").replace(/\.$/, "") : (c.look ?? "");
    const all = [base, c.hairLength].filter(Boolean).join("; ");
    const traits = all ? (c.bible ? ` (${all})` : `: ${all}`) : "";
    if (c.image) {
      const line = `The ${ordinal(n)} attached image is the approved character sheet for ${c.name}, ${c.label}. Draw ${c.name} exactly like that sheet${traits}, in the same art style.`;
      n++;
      return line;
    }
    return `${c.name}, ${c.label}, looks like this${traits || ": a friendly grown-up"}. Keep them looking the same on every page.`;
  });
}

export function buildIllustrationPrompt(req: IllustrationRequest): string {
  const lines = [
    `Illustration for one page of a children's picture book. Art style: ${STYLE_DESCRIPTIONS[req.style]}.`,
    req.characterRef
      ? `The first attached image is the approved character sheet for ${req.childName}. Draw ${req.childName} with exactly the same face, hair, skin tone, proportions and outfit as in that sheet, in the same art style.`
      : "",
    req.bible ? describeBible(req.childName, req.bible) : "",
    ...castLines(req),
    req.story?.characters?.length
      ? `Recurring characters, drawn exactly the same on every page of this book (never change their species, colors, size, clothes or accessories, and never add glasses, hats or anything not listed): ${req.story.characters.join(" ")}`
      : "",
    req.story?.summary ? `The whole story, for context (draw only this page's moment): ${req.story.summary}` : "",
    req.story?.previousMoment ? `The page before shows: ${req.story.previousMoment}.` : "",
    req.story?.nextMoment ? `The page after shows: ${req.story.nextMoment}.` : "",
    req.story?.pageText ? `The words on this page (for meaning only; never draw any words): ${JSON.stringify(req.story.pageText)}` : "",
    `Scene: ${req.scene.action}.`,
    req.scene.mustShow?.length ? `The picture MUST clearly show, exactly as described: ${req.scene.mustShow.join("; ")}.` : "",
    req.scene.continuity ? `Keep consistent with the rest of the book: ${req.scene.continuity}.` : "",
    `Characters present: ${req.scene.characters.join(", ") || req.childName}.`,
    `Setting: ${req.scene.setting}.`,
    `Mood: ${req.scene.mood}. Camera: ${req.scene.framing}.`,
    req.palette.length ? `Color palette leaning on ${req.palette.join(", ")}.` : "",
    VIGNETTE_STYLES.has(req.style)
      ? "Draw the scene as a small, airy vignette in the middle of a plain white page: generous empty white space all around, edges fading softly into the white paper, no background color filling the frame."
      : req.textZone
        ? ZONE_SPACE[req.textZone]
        : "",
    req.note ? `Parent's note for this picture: ${req.note}` : "",
    "Keep every face and important detail well inside the frame, away from the edges (the page will be trimmed and bound). Show every character's whole head, hair and raised hands, with clear space above the tallest head: the top edge must never cut through a head or face.",
    NO_TEXT_RULE,
    SAFETY_RULE,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildCharacterSheetPrompt(opts: { style: ArtStyle; outfit?: string; variant: number; subject?: "child" | "grownup"; hairLength?: string }): string {
  if (opts.subject === "grownup") {
    const variety = ["", "Offer a slightly different interpretation (different expression and pose), keeping the likeness.", "Offer a fresh interpretation with a different, still neutral outfit color, keeping the likeness."][opts.variant % 3];
    return [
      `Create a character turnaround sheet for a children's picture book, in this art style: ${STYLE_DESCRIPTIONS[opts.style]}.`,
      "The attached photos show a real grown-up (a parent or family member). Turn them into a warm, friendly illustrated character who is clearly recognizable as this person: same hair color and style, eye color, skin tone, face shape, glasses, beard or freckles if present, and the same approximate age.",
      opts.hairLength && opts.hairLength in HAIR_LENGTHS
        ? `Her hair must be drawn as ${HAIR_LENGTHS[opts.hairLength as HairLength].prompt}, worn down, in all three views, even if a photo shows it a different length or tied up.`
        : "",
      "Show the same character three times side by side on a plain light background: a front view (head to toe), a three-quarter view, and a close-up portrait of the face. Kind, happy expression.",
      `Outfit: ${opts.outfit || "a simple, neutral everyday outfit"}.`,
      variety,
      NO_TEXT_RULE,
      SAFETY_RULE,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const variety = [
    "",
    "Offer a slightly different interpretation from a typical first take (different expression and pose), keeping the likeness.",
    "Offer a fresh interpretation with a different, still neutral outfit color, keeping the likeness.",
  ][opts.variant % 3];
  return [
    `Create a character turnaround sheet for a children's picture book, in this art style: ${STYLE_DESCRIPTIONS[opts.style]}.`,
    "The attached photos show the real child. Turn them into an illustrated character who is clearly recognizable as this child: same hair color and style, eye color, skin tone, face shape, glasses or freckles if present. Keep the child's age; do not make them look older.",
    "Show the same character three times side by side on a plain light background: a front view (head to toe), a three-quarter view, and a close-up portrait of the face. Friendly, happy expression.",
    `Outfit: ${opts.outfit || "a simple, neutral everyday outfit (plain t-shirt, comfortable pants or shorts, sneakers)"}.`,
    variety,
    NO_TEXT_RULE,
    SAFETY_RULE,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildEditPrompt(opts: { instruction: string; style: ArtStyle; childName: string; hasCharacterRef: boolean; textZone: TextZone | null }): string {
  return [
    "Edit the first attached image (a children's picture book illustration) as requested, keeping everything else the same: composition, art style, colors and characters.",
    opts.hasCharacterRef ? `The second attached image is the character sheet for ${opts.childName}; keep ${opts.childName} looking exactly like it.` : "",
    `Requested change: ${opts.instruction}`,
    `Art style: ${STYLE_DESCRIPTIONS[opts.style]}.`,
    opts.textZone ? ZONE_SPACE[opts.textZone] : "",
    NO_TEXT_RULE,
    SAFETY_RULE,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pick the closest supported aspect ratio (by log distance). */
export function nearestAspect(target: number, supported: string[]): string {
  let best = supported[0];
  let bestD = Infinity;
  for (const s of supported) {
    const [w, h] = s.split(":").map(Number);
    const d = Math.abs(Math.log(w / h) - Math.log(target));
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
