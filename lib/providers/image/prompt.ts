/**
 * Provider-neutral prompt text for illustrations. Every image adapter builds
 * its request from these strings so behavior stays consistent across providers.
 */
import type { ArtStyle } from "../../schemas/theme";
import type { CharacterBible, TextZone } from "../../schemas/story";
import type { IllustrationRequest } from "./types";

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
  "whimsical-ink":
    "whimsical, topsy-turvy picture-book illustration: wobbly hand-inked black outlines, bold flat colors from a small bright palette with plenty of white, curvy leaning buildings and corkscrew towers, tufty lollipop trees, curly spirals and dotted patterns, rounded rubbery characters with expressive faces, playful impossible perspective",
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

export function buildIllustrationPrompt(req: IllustrationRequest): string {
  const lines = [
    `Illustration for one page of a children's picture book. Art style: ${STYLE_DESCRIPTIONS[req.style]}.`,
    req.characterRef
      ? `The first attached image is the approved character sheet for ${req.childName}. Draw ${req.childName} with exactly the same face, hair, skin tone, proportions and outfit as in that sheet, in the same art style.`
      : "",
    req.bible ? describeBible(req.childName, req.bible) : "",
    `Scene: ${req.scene.action}.`,
    `Characters present: ${req.scene.characters.join(", ") || req.childName}.`,
    `Setting: ${req.scene.setting}.`,
    `Mood: ${req.scene.mood}. Camera: ${req.scene.framing}.`,
    req.palette.length ? `Color palette leaning on ${req.palette.join(", ")}.` : "",
    req.textZone ? ZONE_SPACE[req.textZone] : "",
    req.note ? `Parent's note for this picture: ${req.note}` : "",
    "Keep every face and important detail well inside the frame, away from the edges (the page will be trimmed and bound).",
    NO_TEXT_RULE,
    SAFETY_RULE,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildCharacterSheetPrompt(opts: { style: ArtStyle; outfit?: string; variant: number }): string {
  const variety = [
    "",
    "Offer a slightly different interpretation from a typical first take (different expression and pose), keeping the likeness.",
    "Offer a third interpretation with a different, still neutral outfit color, keeping the likeness.",
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
