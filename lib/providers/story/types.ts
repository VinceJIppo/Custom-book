import type { ChildSnapshot } from "../../schemas/child";
import type { BookOptions } from "../../schemas/book";
import type { ThemeConfig } from "../../schemas/theme";
import type { CharacterBible, Outline, Scene, StoryPagesResult } from "../../schemas/story";
import type { ImageData, WithUsage } from "../types";

export interface StoryContext {
  child: ChildSnapshot;
  theme: ThemeConfig;
  options: BookOptions;
}

export interface StoryProvider {
  readonly name: string;
  generateOutline(ctx: StoryContext): Promise<WithUsage<Outline>>;
  generatePages(outline: Outline, ctx: StoryContext): Promise<WithUsage<StoryPagesResult>>;
  reviseText(page: { text: string; scene: Scene | null }, instruction: string, ctx: StoryContext): Promise<WithUsage<{ text: string }>>;
  describeCharacter(sheet: ImageData): Promise<WithUsage<CharacterBible>>;
}
