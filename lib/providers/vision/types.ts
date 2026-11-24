import type { CharacterBible } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface PhotoCheck {
  /** Number of human faces visible. */
  faces: number;
  /** True when the photo is usable for a character sheet. */
  ok: boolean;
  /** Plain-English problems for the parent, e.g. "The face is partly covered." */
  problems: string[];
  /** Where the main person's face is, as fractions (0 to 1) of the width and height. Used to suggest a crop. */
  mainFace?: FaceBox | null;
  /** True when cropping to the main face would likely fix the photo (other faces, or a small face). */
  cropWouldHelp?: boolean;
}

export interface FaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PageCheckInput {
  page: ImageData;
  /** Approved character sheet; null skips the likeness part. */
  sheet: ImageData | null;
  bible: CharacterBible | null;
  childName: string;
  /** The words printed on this page. */
  pageText: string;
  /** Concrete things the words say the picture must show. */
  mustShow: string[];
  /** World state that must be visible (e.g. "the whole town is upside down"). */
  continuity: string;
}

export interface PageCheck {
  /** 0 to 1: how closely the hero matches the character sheet (null when not checked). */
  likeness: { score: number; issues: string[] } | null;
  /** 0 to 1: how well the picture shows what the words say and keeps the world consistent. */
  story: { score: number; missing: string[] };
  ok: boolean;
}

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  /** subject: whose photo it is, so the wording fits (a child, or a grown-up). */
  checkPhoto(photo: ImageData, subject?: "child" | "grownup"): Promise<WithUsage<PhotoCheck>>;
  /** One check per page: likeness to the character sheet, and words versus picture. */
  checkPage(input: PageCheckInput): Promise<WithUsage<PageCheck>>;
}
