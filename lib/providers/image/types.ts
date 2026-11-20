import type { ArtStyle } from "../../schemas/theme";
import type { CharacterBible, Scene, TextZone } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface IllustrationRequest {
  /** Approved Character Sheet image. Never raw photos. Null until Phase 2. */
  characterRef: ImageData | null;
  bible: CharacterBible | null;
  childName: string;
  scene: Scene;
  style: ArtStyle;
  /** width / height */
  aspect: number;
  /** Where the layout will put text; the art must leave this area clean. */
  textZone: TextZone | null;
  palette: string[];
  /** Human label for mocks and logs, e.g. "Page 4". */
  label: string;
}

export interface ImageProvider {
  readonly name: string;
  generateCharacterSheet(input: { photos: ImageData[]; style: ArtStyle; outfit?: string; count: number }): Promise<WithUsage<ImageData[]>>;
  generateIllustration(req: IllustrationRequest): Promise<WithUsage<ImageData>>;
  editIllustration(input: { image: ImageData; instruction: string; characterRef: ImageData | null; style: ArtStyle }): Promise<WithUsage<ImageData>>;
}
