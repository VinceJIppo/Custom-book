import { z } from "zod";
import type { StoryContext, StoryProvider, ThemeDraftRequest } from "../story/types";
import {
  CharacterBibleSchema,
  EditorReportSchema,
  OutlineSchema,
  SceneSchema,
  StoryLayoutSchema,
  TextZoneSchema,
  validateStoryPages,
  type CharacterBible,
  type EditorReport,
  type Outline,
  type Scene,
  type StoryPage,
  type StoryPagesResult,
} from "../../schemas/story";
import { note } from "../../schemas/story";
import { ART_STYLES, ThemeConfigSchema, type ThemeConfig } from "../../schemas/theme";
import { sumUsage, type ImageData, type Usage, type WithUsage } from "../types";
import { ClaudeJson, imageBlock, type ClaudeOptions } from "./client";
import {
  ART_SYSTEM_PROMPT,
  DESCRIBE_CHARACTER_PROMPT,
  EDITOR_SYSTEM_PROMPT,
  STORY_SYSTEM_PROMPT,
  THEME_SYSTEM_PROMPT,
  artDirectionPrompt,
  editorPrompt,
  manuscriptPrompt,
  outlinePrompt,
  revisePrompt,
  rewritePrompt,
  themePrompt,
} from "./storyPrompts";
import { findProtectedNames } from "../../safety/protectedNames";

/*
 * Wire schemas sent to the API as structured-output formats. They carry the
 * shape only; lengths and counts are enforced afterwards with the app schemas,
 * and a failed check triggers a retry with feedback.
 */
const WireScene = z.object({
  action: z.string(),
  characters: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  framing: z.string(),
  mustShow: z.array(z.string()),
  continuity: z.string(),
});
const WireOutline = z.object({
  title: z.string(),
  premise: z.string(),
  worldRule: z.string(),
  problem: z.string(),
  goal: z.string(),
  attempts: z.array(z.object({ attempt: z.string(), whyItFails: z.string() })),
  turningPoint: z.string(),
  resolution: z.string(),
  lessonShown: z.string(),
  setups: z.array(z.object({ item: z.string(), setUpOnPage: z.number().int(), paysOffOnPage: z.number().int() })),
  continuity: z.array(z.object({ fact: z.string(), fromPage: z.number().int(), toPage: z.number().int() })),
  endingEcho: z.string(),
  pages: z.array(
    z.object({
      pageNumber: z.number().int(),
      beat: z.string(),
      summary: z.string(),
      causeFromPrevious: z.string(),
      characters: z.array(z.string()),
      visualState: z.string(),
    }),
  ),
});
const WireManuscript = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int(), text: z.string() })),
  dedication: z.string(),
  backCoverBlurb: z.string(),
});
const ManuscriptSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().min(1), text: z.string().min(1).max(900) })).min(4).max(30),
  dedication: z.string().min(2).max(300),
  backCoverBlurb: z.string().min(10).max(500),
});
type Manuscript = z.infer<typeof ManuscriptSchema>;
const WireEditor = z.object({
  verdict: z.enum(["pass", "revise"]),
  overall: z.string(),
  issues: z.array(z.object({ page: z.number().int(), problem: z.string(), fix: z.string() })),
});
const WireArt = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int(),
      scene: WireScene,
      layout: z.enum(["fullBleed", "imageTop", "spread", "textSpot"]),
      textZone: z.enum(["top", "bottom", "left", "right"]),
    }),
  ),
  storySummary: z.string(),
  coverScene: WireScene,
});
const ArtSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().min(1), scene: SceneSchema, layout: StoryLayoutSchema, textZone: TextZoneSchema })).min(4).max(30),
  storySummary: note(1200, 20),
  coverScene: SceneSchema,
});

/** Page numbers must run 1..n exactly. */
function numberingProblems(pages: Array<{ pageNumber: number }>, n: number): string[] {
  if (pages.length !== n) return [`Return exactly ${n} pages (you returned ${pages.length}).`];
  const bad = pages.map((p) => p.pageNumber).sort((a, b) => a - b).some((num, i) => num !== i + 1);
  return bad ? [`Number the pages 1 to ${n} in order, without gaps.`] : [];
}

/** At most this many editor-led rewrites per book. */
const MAX_REVISIONS = 1;

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
      extraCheck: (o) => {
        const problems = numberingProblems(o.pages, n);
        if (!o.worldRule.trim() || !o.problem.trim() || !o.goal.trim()) problems.push("Fill in worldRule, problem and goal: the story needs them to make sense.");
        if (o.attempts.length < 1) problems.push("Plan at least one attempt that fails for a clear reason before the solution.");
        const missingLinks = o.pages.filter((pg) => pg.pageNumber > 1 && !pg.causeFromPrevious.trim()).map((pg) => pg.pageNumber);
        if (missingLinks.length) problems.push(`Give causeFromPrevious for pages ${missingLinks.join(", ")}: how each follows from the page before.`);
        const badSetups = o.setups.filter((x) => x.setUpOnPage > x.paysOffOnPage).map((x) => x.item);
        if (badSetups.length) problems.push(`Set these up before they pay off: ${badSetups.join(", ")}.`);
        return problems;
      },
      maxTokens: 48000,
    });
  }

  /**
   * Writes the book in stages, like an author and editor: the whole manuscript,
   * an editor's review, a rewrite when the editor finds problems, and finally
   * art direction (scenes, must-show details, continuity) for the finished words.
   */
  async generatePages(outline: Outline, ctx: StoryContext): Promise<WithUsage<StoryPagesResult>> {
    const n = ctx.options.length;
    const usages: Usage[] = [];
    const run = async <T>(r: Promise<WithUsage<T>>) => {
      const out = await r;
      usages.push(out.usage);
      return out.value;
    };

    let manuscript: Manuscript = await run(
      this.claude.generate({
        label: "manuscript",
        system: STORY_SYSTEM_PROMPT,
        build: (p) => manuscriptPrompt(ctx, outline, p),
        wire: WireManuscript,
        schema: ManuscriptSchema,
        extraCheck: (m) => numberingProblems(m.pages, n),
        maxTokens: 48000,
      }),
    );

    const editorNotes: EditorReport[] = [];
    for (let round = 0; round <= MAX_REVISIONS; round++) {
      const report = await run(
        this.claude.generate({
          label: "editor",
          system: EDITOR_SYSTEM_PROMPT,
          build: () => editorPrompt(ctx, outline, manuscript.pages),
          wire: WireEditor,
          schema: EditorReportSchema,
          maxTokens: 24000,
        }),
      );
      editorNotes.push(report);
      if (report.verdict === "pass" || report.issues.length === 0 || round === MAX_REVISIONS) break;
      manuscript = await run(
        this.claude.generate({
          label: "rewrite",
          system: STORY_SYSTEM_PROMPT,
          build: (p) => rewritePrompt(ctx, outline, manuscript.pages, report.issues, p),
          wire: WireManuscript,
          schema: ManuscriptSchema,
          extraCheck: (m) => numberingProblems(m.pages, n),
          maxTokens: 48000,
        }),
      );
    }

    const art = await run(
      this.claude.generate({
        label: "art direction",
        system: ART_SYSTEM_PROMPT,
        build: (p) => artDirectionPrompt(ctx, outline, manuscript.pages, p),
        wire: WireArt,
        schema: ArtSchema,
        extraCheck: (a) => {
          const problems = numberingProblems(a.pages, n);
          const spreads = a.pages.filter((pg) => pg.layout === "spread").length;
          if (spreads > 2) problems.push(`Use at most 2 spreads (you used ${spreads}).`);
          const empty = a.pages.filter((pg) => pg.scene.mustShow.length === 0).map((pg) => pg.pageNumber);
          if (empty.length) problems.push(`List mustShow details for pages ${empty.join(", ")}.`);
          return problems;
        },
        maxTokens: 64000,
      }),
    );

    const textByPage = new Map(manuscript.pages.map((p) => [p.pageNumber, p.text]));
    const pages: StoryPage[] = art.pages
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((p) => ({ pageNumber: p.pageNumber, text: textByPage.get(p.pageNumber) ?? "", scene: p.scene, layout: p.layout, textZone: p.textZone }));
    const problems = validateStoryPages(pages, n);
    if (problems.length) throw new Error(`The story pages didn't line up: ${problems.join(" ")}`);

    return {
      value: {
        pages,
        dedication: ctx.options.dedication || manuscript.dedication,
        backCoverBlurb: manuscript.backCoverBlurb,
        coverScene: art.coverScene,
        storySummary: art.storySummary,
        editorNotes,
      },
      usage: sumUsage(this.name, usages),
    };
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
