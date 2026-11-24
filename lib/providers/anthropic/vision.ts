import { z } from "zod";
import type { PageCheck, PageCheckInput, PhotoCheck, VisionProvider } from "../vision/types";
import type { ImageData, WithUsage } from "../types";
import { list, note } from "../../schemas/story";
import { ClaudeJson, imageBlock, type ClaudeOptions } from "./client";

const VISION_SYSTEM = `You check images for a children's picture book app used by parents. Be accurate and concise. Report only what you can see. Never identify real people; describe visual traits only.`;

const WireBox = z.object({ left: z.number(), top: z.number(), width: z.number(), height: z.number() });
const WirePhoto = z.object({ faces: z.number().int(), faceClearlyVisible: z.boolean(), problems: z.array(z.string()), mainFace: WireBox.nullable() });
const Frac = z.number().min(0).max(1);
const PhotoSchema = z.object({
  faces: z.number().int().min(0).max(50),
  faceClearlyVisible: z.boolean(),
  problems: list(note(200), 5),
  mainFace: z.object({ left: Frac, top: Frac, width: Frac, height: Frac }).nullable().optional(),
});

const WirePage = z.object({
  likenessScore: z.number(),
  likenessIssues: z.array(z.string()),
  storyScore: z.number(),
  missing: z.array(z.string()),
});
const PageSchema = z.object({
  likenessScore: z.number().min(0).max(1),
  likenessIssues: list(note(200), 6),
  storyScore: z.number().min(0).max(1),
  missing: list(note(240), 8),
});

/** Pages scoring below this (on either check) are redrawn once, then flagged for the parent. */
export const CONSISTENCY_THRESHOLD = 0.7;
export const STORY_MATCH_THRESHOLD = 0.7;

function clampBox(b: { left: number; top: number; width: number; height: number }) {
  const left = Math.min(Math.max(b.left, 0), 1);
  const top = Math.min(Math.max(b.top, 0), 1);
  const width = Math.min(Math.max(b.width, 0.01), 1 - left);
  const height = Math.min(Math.max(b.height, 0.01), 1 - top);
  return { left, top, width, height };
}

export class AnthropicVisionProvider implements VisionProvider {
  readonly name = "anthropic";
  private readonly claude: ClaudeJson;

  constructor(opts: ClaudeOptions) {
    this.claude = new ClaudeJson(opts);
  }

  get model() {
    return this.claude.model;
  }

  async checkPhoto(photo: ImageData, subject: "child" | "grownup" = "child"): Promise<WithUsage<PhotoCheck>> {
    const res = await this.claude.generate({
      label: "checkPhoto",
      system: VISION_SYSTEM,
      build: () => [
        imageBlock(photo),
        {
          type: "text",
          text: `${subject === "grownup" ? "A parent uploaded this photo of a grown-up (for example a parent or grandparent) so an illustrator can draw them as a cartoon character in a child's book." : "A parent uploaded this photo of their child so an illustrator can draw the child as a cartoon character."} Count the human faces. Say whether one face is clearly visible (not blurry, not tiny, not covered by hands, hats, sunglasses or heavy shadow). List up to 3 short, friendly problems a parent could fix by choosing a different photo; return an empty list if the photo is good.
mainFace: the face of the main subject (the largest, sharpest, most central face; with several people, the one the photo is mostly about) as a box in fractions of the image: left and top of the box's top-left corner, then width and height, each from 0 to 1. Null if there is no face.`,
        },
      ],
      wire: WirePhoto,
      schema: PhotoSchema,
      maxTokens: 4000,
    });
    const v = res.value;
    const problems = [...v.problems];
    if (v.faces === 0) problems.unshift("We couldn't find a face in this photo.");
    if (v.faces > 1) problems.unshift(`We found ${v.faces} faces. Crop the photo to just ${subject === "grownup" ? "this person" : "your child"}, or use a photo with only them in it.`);
    const box = v.mainFace ? clampBox(v.mainFace) : null;
    // Cropping helps when there are other faces, or when the main face is small in a big scene.
    const cropWouldHelp = !!box && (v.faces > 1 || box.width * box.height < 0.02);
    return { value: { faces: v.faces, ok: v.faces === 1 && v.faceClearlyVisible, problems: problems.slice(0, 4), mainFace: box, cropWouldHelp }, usage: res.usage };
  }

  async checkPage(input: PageCheckInput): Promise<WithUsage<PageCheck>> {
    const withSheet = !!input.sheet;
    const bible = input.bible
      ? `Expected traits: hair ${input.bible.hair}; eyes ${input.bible.eyes}; skin tone ${input.bible.skinTone}; face ${input.bible.faceShape}; glasses ${input.bible.glasses}; freckles ${input.bible.freckles}; outfit ${input.bible.signatureOutfit}.`
      : "";
    const res = await this.claude.generate({
      label: "checkPage",
      system: VISION_SYSTEM,
      build: () => [
        ...(input.sheet ? [imageBlock(input.sheet)] : []),
        imageBlock(input.page),
        {
          type: "text" as const,
          text: `${withSheet ? `Image 1 is the approved character sheet for the hero, ${input.childName}. Image 2 is a page illustration.` : `The image is a page illustration. The hero is ${input.childName}.`}

The words printed on this page: ${JSON.stringify(input.pageText)}
The picture must show: ${input.mustShow.length ? input.mustShow.map((m) => `"${m}"`).join("; ") : "(see the words)"}
It must also stay consistent with: ${input.continuity || "(nothing special)"}

1. ${withSheet ? `likenessScore (0 to 1): is ${input.childName} drawn as the same character as in the sheet? 1 = clearly the same; below 0.7 = drift a parent would notice (different hair color or style, skin tone, glasses, face or age). Outfit changes the scene calls for are fine. If the hero is missing, score 0. ${bible} likenessIssues: the drifts, as short phrases.` : "likenessScore: return 1 and no likenessIssues (no sheet to compare)."}
2. storyScore (0 to 1): does the picture show what the words say? 1 = a reader would see everything the words describe; below 0.7 = something the words describe is missing, contradicted (for example the words say a hat is on his head but the picture shows it on his toes) or the lasting world state is not visible, or a recurring character is drawn differently from how it is described above (a different kind of animal, different colors, or glasses, a hat or clothes it should not have, or missing ones it should). missing: each thing that is missing or contradicted, as a short phrase saying what the picture should show instead.
Ignore art style and any blank space left for text.`,
        },
      ],
      wire: WirePage,
      schema: PageSchema,
      maxTokens: 4000,
    });
    const v = res.value;
    const likeness = withSheet ? { score: v.likenessScore, issues: v.likenessIssues } : null;
    const ok = (!likeness || likeness.score >= CONSISTENCY_THRESHOLD) && v.storyScore >= STORY_MATCH_THRESHOLD;
    return { value: { likeness, story: { score: v.storyScore, missing: v.missing }, ok }, usage: res.usage };
  }
}
