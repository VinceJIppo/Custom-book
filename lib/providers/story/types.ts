import type { CastMemberSnapshot, ChildSnapshot } from "../../schemas/child";
import type { BookOptions } from "../../schemas/book";
import type { ThemeConfig } from "../../schemas/theme";
import type { CharacterBible, Outline, Scene, StoryPagesResult } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface StoryContext {
  /** The child the book is for (and its hero, unless options.spotlightId names someone else). */
  child: ChildSnapshot;
  /** Other real people in the story: grown-ups or other children. */
  cast?: CastMemberSnapshot[];
  theme: ThemeConfig;
  options: BookOptions;
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
  describeCharacter(sheet: ImageData): Promise<WithUsage<CharacterBible>>;
  /** Custom Theme Builder: draft a full original theme config from a description. */
  draftTheme(req: ThemeDraftRequest): Promise<WithUsage<ThemeConfig>>;
}
