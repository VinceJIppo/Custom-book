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
}

export interface StoryContextForArt {
  /** The whole story in a few sentences. */
  summary: string;
  /** The words printed on this page (for meaning; never drawn as text). */
  pageText: string;
  /** What the previous and next pages show, for continuity. */
  previousMoment?: string;
  nextMoment?: string;
}

export interface CharacterSheetRequest {
  /** Raw photos of the child. Only ever sent for character sheets. */
  photos: ImageData[];
  style: ArtStyle;
  outfit?: string;
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
