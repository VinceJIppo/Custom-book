import type { CastMemberSnapshot, ChildSnapshot } from "../../schemas/child";
import type { BookOptions } from "../../schemas/book";
import type { ThemeConfig } from "../../schemas/theme";
import type { CharacterBible, Outline, Scene, StoryLayout, StoryPagesResult, TextZone } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface StoryContext {
  /** The child the book is for (and its hero, unless options.spotlightId names someone else). */
  child: ChildSnapshot;
  /** Other real people in the story: grown-ups or other children. */
  cast?: CastMemberSnapshot[];
  theme: ThemeConfig;
  options: BookOptions;
  /** How the real people look, from their approved character sheets (name -> description). */
  appearance?: { hero?: string; people?: Record<string, string> };
}

export interface ArtInputPage {
  pageNumber: number;
  text: string;
  /** The current plan, if any (the mock keeps it). */
  scene?: Scene;
  layout?: StoryLayout;
  textZone?: TextZone;
}

export interface ArtDirection {
  pages: Array<{ pageNumber: number; scene: Scene; layout: StoryLayout; textZone: TextZone }>;
  coverScene: Scene;
  storySummary: string;
}

export interface ThemeDraftRequest {
  /** Parent's free text, already moderated and checked for protected names. */
  description: string;
  childAge?: number;
}

export interface StoryProvider {
  readonly name: string;
  generateOutline(ctx: StoryContext): Promise<WithUsage<Outline>>;
  generatePages(outline: Outline, ctx: StoryContext): Promise<WithUsage<StoryPagesResult>>;
  reviseText(page: { text: string; scene: Scene | null }, instruction: string, ctx: StoryContext): Promise<WithUsage<{ text: string }>>;
  /** Rewrites some pages of a finished manuscript from the parent's note, keeping them in step with the rest. Returns only changed pages. */
  revisePages(outline: Outline, pages: Array<{ pageNumber: number; text: string }>, target: number[], instruction: string, ctx: StoryContext): Promise<WithUsage<{ pages: Array<{ pageNumber: number; text: string }> }>>;
  /** Picture plans (scenes, layouts, cover, summary) for the words as they now stand. */
  directArt(outline: Outline, pages: ArtInputPage[], ctx: StoryContext): Promise<WithUsage<ArtDirection>>;
  describeCharacter(sheet: ImageData): Promise<WithUsage<CharacterBible>>;
  /** Custom Theme Builder: draft a full original theme config from a description. */
  draftTheme(req: ThemeDraftRequest): Promise<WithUsage<ThemeConfig>>;
}
