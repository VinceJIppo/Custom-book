import type { ArtStyle } from "../../schemas/theme";
import type { CharacterBible, Scene, TextZone } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface IllustrationRequest {
  /** Approved Character Sheet image. Never raw photos. Null when no sheet is approved yet. */
  characterRef: ImageData | null;
  bible: CharacterBible | null;
  childName: string;
  scene: Scene;
  style: ArtStyle;
  /** width / height */
  aspect: number;
  /** Final print size in pixels; adapters pick the output resolution from it. */
  targetPx?: { widthPx: number; heightPx: number };
  /** Where the layout will put text; the art must leave this area clean. */
  textZone: TextZone | null;
  palette: string[];
  /** Human label for mocks and logs, e.g. "Page 4". */
  label: string;
  /** Optional parent note, e.g. "make him smile". */
  note?: string;
  /** The whole story, so each picture fits its place in it. */
  story?: StoryContextForArt;
  /** Other real people in this picture, each drawn from their own character sheet (sent after the hero's) or description. */
  cast?: CastRef[];
}

export interface CastRef {
  /** The name used in the story, e.g. "Mama". */
  name: string;
  /** Who they are, e.g. "Oliver's mom". */
  label: string;
  image: ImageData | null;
  bible: CharacterBible | null;
  look?: string;
  /** e.g. "hair length: long hair that falls well past the shoulders"; overrides the sheet and photos. */
  hairLength?: string;
}

/** Reference images in the order adapters attach them: the hero's sheet, then each cast member's. */
export function referenceImages(req: Pick<IllustrationRequest, "characterRef" | "cast">): ImageData[] {
  return [req.characterRef, ...(req.cast ?? []).map((c) => c.image)].filter((x): x is ImageData => !!x);
}

export interface StoryContextForArt {
  /** The whole story in a few sentences. */
  summary: string;
  /** The words printed on this page (for meaning; never drawn as text). */
  pageText: string;
  /** What the previous and next pages show, for continuity. */
  previousMoment?: string;
  nextMoment?: string;
  /** How each recurring character in this picture looks for the whole book ("Pip is a small red fox: ..."). */
  characters?: string[];
}

export interface CharacterSheetRequest {
  /** Raw photos of the person. Only ever sent for character sheets. */
  photos: ImageData[];
  /** A child (keep their age) or a grown-up. */
  subject?: "child" | "grownup";
  style: ArtStyle;
  outfit?: string;
  /** A grown-up woman's chosen hair length (key of HAIR_LENGTHS). */
  hairLength?: string;
  count: number;
}

export interface EditRequest {
  image: ImageData;
  instruction: string;
  characterRef: ImageData | null;
  style: ArtStyle;
  childName: string;
  textZone: TextZone | null;
  targetPx?: { widthPx: number; heightPx: number };
}

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generateCharacterSheet(input: CharacterSheetRequest): Promise<WithUsage<ImageData[]>>;
  generateIllustration(req: IllustrationRequest): Promise<WithUsage<ImageData>>;
  editIllustration(input: EditRequest): Promise<WithUsage<ImageData>>;
}

/** One picture in an overnight batch. The key comes back with its result. */
export interface BatchItem {
  key: string;
  req: IllustrationRequest;
}

export type BatchState = "pending" | "running" | "succeeded" | "failed" | "expired" | "cancelled";

export interface BatchResult {
  key: string;
  image?: WithUsage<ImageData>;
  error?: string;
}

/**
 * Image services with a cheaper, slower batch queue (Gemini Batch Mode: half
 * price, done within 24 hours). A submit may be split into several batches.
 */
export interface BatchImageProvider {
  submitIllustrationBatch(items: BatchItem[], label: string): Promise<string[]>;
  getIllustrationBatch(name: string): Promise<{ state: BatchState; results?: BatchResult[] }>;
  /** Stops a batch and deletes it at the provider (used when its book or account is deleted). Best effort. */
  cancelIllustrationBatch?(name: string): Promise<void>;
}

export function supportsBatch(p: ImageProvider): p is ImageProvider & BatchImageProvider {
  const b = p as Partial<BatchImageProvider>;
  return typeof b.submitIllustrationBatch === "function" && typeof b.getIllustrationBatch === "function";
}
