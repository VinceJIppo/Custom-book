import { z } from "zod";
import type { StoryContext, StoryProvider, ThemeDraftRequest } from "../story/types";
import {
  CharacterBibleSchema,
  OutlineSchema,
  StoryPagesResultSchema,
  validateStoryPages,
  type CharacterBible,
  type Outline,
  type Scene,
  type StoryPagesResult,
} from "../../schemas/story";
import { ART_STYLES, ThemeConfigSchema, type ThemeConfig } from "../../schemas/theme";
import type { ImageData, WithUsage } from "../types";
import { ClaudeJson, imageBlock, type ClaudeOptions } from "./client";
import {
  DESCRIBE_CHARACTER_PROMPT,
  STORY_SYSTEM_PROMPT,
  THEME_SYSTEM_PROMPT,
  outlinePrompt,
  pagesPrompt,
  revisePrompt,
  themePrompt,
} from "./storyPrompts";
import { findProtectedNames } from "../../safety/protectedNames";

/*
 * Wire schemas sent to the API as structured-output formats. They carry the
 * shape only; lengths and counts are enforced afterwards with the app schemas,
 * and a failed check triggers a retry with feedback.
 */
const WireScene = z.object({ action: z.string(), characters: z.array(z.string()), setting: z.string(), mood: z.string(), framing: z.string() });
const WireOutline = z.object({
  title: z.string(),
  premise: z.string(),
  pages: z.array(z.object({ pageNumber: z.number().int(), beat: z.string(), summary: z.string(), characters: z.array(z.string()) })),
});
const WirePages = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int(),
      text: z.string(),
      scene: WireScene,
      layout: z.enum(["fullBleed", "imageTop", "spread", "textSpot"]),
      textZone: z.enum(["top", "bottom", "left", "right"]),
    }),
  ),
  dedication: z.string(),
  backCoverBlurb: z.string(),
  coverScene: WireScene,
});
const WireRevision = z.object({ text: z.string() });
const WireBible = z.object({
  hair: z.string(),
  eyes: z.string(),
  skinTone: z.string(),
  faceShape: z.string(),
  glasses: z.string(),
  freckles: z.string(),
  signatureOutfit: z.string(),
  otherDetails: z.string(),
});
const WireTheme = z.object({
  id: z.string(),
  name: z.string(),
  genre: z.string(),
  ageRange: z.array(z.number().int()),
  pitch: z.string(),
  setting: z.string(),
  supportingCast: z.array(z.object({ name: z.string(), role: z.string(), look: z.string() })),
  storyBeats: z.array(z.string()),
  powerIdeas: z.string(),
  artDirection: z.object({ defaultStyle: z.enum(ART_STYLES), palette: z.array(z.string()), mood: z.string() }),
  contentRules: z.array(z.string()),
});

export class AnthropicStoryProvider implements StoryProvider {
  readonly name = "anthropic";
  private readonly claude: ClaudeJson;

  constructor(opts: ClaudeOptions) {
    this.claude = new ClaudeJson(opts);
  }

  generateOutline(ctx: StoryContext): Promise<WithUsage<Outline>> {
    const n = ctx.options.length;
    return this.claude.generate({
      label: "outline",
      system: STORY_SYSTEM_PROMPT,
      build: (p) => outlinePrompt(ctx, p),
      wire: WireOutline,
      schema: OutlineSchema,
      extraCheck: (o) => (o.pages.length === n ? [] : [`The outline must have exactly ${n} pages (it had ${o.pages.length}).`]),
      maxTokens: 24000,
    });
  }

  generatePages(outline: Outline, ctx: StoryContext): Promise<WithUsage<StoryPagesResult>> {
    return this.claude.generate({
      label: "pages",
      system: STORY_SYSTEM_PROMPT,
      build: (p) => pagesPrompt(ctx, outline, p),
      wire: WirePages,
      schema: StoryPagesResultSchema,
      extraCheck: (r) => validateStoryPages(r.pages, ctx.options.length),
      maxTokens: 48000,
    });
  }

  reviseText(page: { text: string; scene: Scene | null }, instruction: string, ctx: StoryContext): Promise<WithUsage<{ text: string }>> {
    return this.claude.generate({
      label: "revise",
      system: STORY_SYSTEM_PROMPT,
      build: () => revisePrompt(page.text, page.scene?.action ?? null, instruction, ctx),
      wire: WireRevision,
      schema: z.object({ text: z.string().min(1).max(900) }),
      maxTokens: 8000,
    });
  }

  describeCharacter(sheet: ImageData): Promise<WithUsage<CharacterBible>> {
    return this.claude.generate({
      label: "describeCharacter",
      system: STORY_SYSTEM_PROMPT,
      build: () => [imageBlock(sheet), { type: "text", text: DESCRIBE_CHARACTER_PROMPT }],
      wire: WireBible,
      schema: CharacterBibleSchema,
      maxTokens: 8000,
    });
  }

  draftTheme(req: ThemeDraftRequest): Promise<WithUsage<ThemeConfig>> {
    return this.claude.generate({
      label: "draftTheme",
      system: THEME_SYSTEM_PROMPT,
      build: (p) => themePrompt(req, p),
      wire: WireTheme,
      schema: ThemeConfigSchema as unknown as z.ZodType<ThemeConfig>,
      extraCheck: (t) => {
        // The model must never put protected characters into an original theme.
        const text = JSON.stringify(t);
        const hits = findProtectedNames(text);
        return hits.length ? [`Remove ${hits.map((h) => h.name).join(", ")}: use only original characters and places.`] : [];
      },
      maxTokens: 16000,
    });
  }
}
