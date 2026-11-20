import type { CharacterBible } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface PhotoCheck {
  /** Number of human faces visible. */
  faces: number;
  /** True when the photo is usable for a character sheet. */
  ok: boolean;
  /** Plain-English problems for the parent, e.g. "The face is partly covered." */
  problems: string[];
}

export interface ConsistencyCheck {
  consistent: boolean;
  /** 0 to 1: how closely the page matches the character sheet. */
  score: number;
  /** Plain-English drift, e.g. "hair is blond instead of brown". */
  issues: string[];
}

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  checkPhoto(photo: ImageData): Promise<WithUsage<PhotoCheck>>;
  compareCharacter(input: { sheet: ImageData; page: ImageData; bible: CharacterBible | null; childName: string }): Promise<WithUsage<ConsistencyCheck>>;
}
