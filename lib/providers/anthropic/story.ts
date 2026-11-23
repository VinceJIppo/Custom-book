import { z } from "zod";
import { continuityProblems } from "../../books/continuity";
import type { ArtDirection, ArtInputPage, DraftCheckpoint, ManuscriptOptions, ManuscriptResult, StoryContext, StoryProvider, ThemeDraftRequest } from "../story/types";
import type { Effort } from "./client";
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
import { cleanDashes, verseProblems } from "../../schemas/storyText";
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
  themePrompt, chosenStarter } from "./storyPrompts";
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
  characters: z.array(z.object({ name: z.string(), species: z.string(), look: z.string() })),
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
/** Only the pages a rewrite changes; empty dedication/blurb mean "keep". */
const WirePatch = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int(), text: z.string() })),
  dedication: z.string(),
  backCoverBlurb: z.string(),
});
const PatchSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().min(1), text: z.string().min(1).max(900) })).max(30),
  dedication: z.string().max(300),
  backCoverBlurb: z.string().max(500),
});
type Patch = z.infer<typeof PatchSchema>;
const WireEditor = z.object({
  verdict: z.enum(["pass", "revise"]),
  overall: z.string(),
  issues: z.array(z.object({ page: z.number().int(), problem: z.string(), fix: z.string(), severity: z.enum(["major", "minor"]) })),
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
  props: z.array(z.object({ name: z.string() })),
});
const ArtSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().min(1), scene: SceneSchema, layout: StoryLayoutSchema, textZone: TextZoneSchema })).min(4).max(30),
  storySummary: note(1200, 20),
  coverScene: SceneSchema,
  props: z.array(z.object({ name: z.string() })).default([]),
});

/** Page numbers must run 1..n exactly. */
function numberingProblems(pages: Array<{ pageNumber: number }>, n: number): string[] {
  if (pages.length !== n) return [`Return exactly ${n} pages (you returned ${pages.length}).`];
  const bad = pages.map((p) => p.pageNumber).sort((a, b) => a - b).some((num, i) => num !== i + 1);
  return bad ? [`Number the pages 1 to ${n} in order, without gaps.`] : [];
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pictures that show a prop or character before the words introduce it. The
 * first mention is taken from the manuscript itself, not from the plan.
 */
export function earlyPropProblems(
  pages: Array<{ pageNumber: number; scene: Scene }>,
  manuscript: Array<{ pageNumber: number; text: string }>,
  props: Array<{ name: string }>,
): string[] {
  const problems: string[] = [];
  for (const { name } of props) {
    const clean = name.trim();
    if (clean.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(clean)}\\b`, "i");
    const first = manuscript.filter((p) => re.test(p.text)).map((p) => p.pageNumber).sort((a, b) => a - b)[0];
    if (!first) continue;
    for (const p of pages) {
      if (p.pageNumber >= first) continue;
      const pictured = [p.scene.action, p.scene.continuity, ...p.scene.mustShow, ...p.scene.characters].join(" ");
      if (re.test(pictured)) problems.push(`Page ${p.pageNumber}'s picture shows "${clean}", but the words only bring it in on page ${first}. Remove it from page ${p.pageNumber}'s action, mustShow, continuity and characters.`);
    }
  }
  return problems.slice(0, 10);
}

/** Applies a rewrite that returns only changed pages. */
function applyPatch(m: Manuscript, patch: Patch): Manuscript {
  const changed = new Map(patch.pages.map((p) => [p.pageNumber, p.text]));
  return {
    pages: m.pages.map((p) => ({ pageNumber: p.pageNumber, text: changed.get(p.pageNumber) ?? p.text })),
    dedication: patch.dedication.trim() || m.dedication,
    backCoverBlurb: patch.backCoverBlurb.trim() || m.backCoverBlurb,
  };
}

function cleanManuscript(m: Manuscript): Manuscript {
  return { pages: m.pages.map((p) => ({ ...p, text: cleanDashes(p.text) })), dedication: cleanDashes(m.dedication), backCoverBlurb: cleanDashes(m.backCoverBlurb) };
}

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

  private readonly effort: Effort;

  constructor(opts: ClaudeOptions) {
    this.claude = new ClaudeJson(opts);
    this.effort = opts.effort;
  }

  async generateOutline(ctx: StoryContext): Promise<WithUsage<Outline>> {
    const n = ctx.options.length;
    const res = await this.claude.generate({
      label: "outline",
      system: STORY_SYSTEM_PROMPT,
      build: (p) => outlinePrompt(ctx, p),
      // A chosen story idea already has its plot worked out: planning needs less thinking.
      effort: chosenStarter(ctx) ? this.lightEffort : undefined,
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
    return { ...res, value: { ...res.value, title: cleanDashes(res.value.title) } };
  }

  /** Editing steps think a little less than planning and writing: same quality, much faster. */
  private get lightEffort(): Effort {
    const order: Effort[] = ["low", "medium", "high", "xhigh", "max"];
    return order.indexOf(this.effort) < order.indexOf("medium") ? this.effort : "medium";
  }

  /**
   * Writes the words in stages, like an author and editor: the whole manuscript,
   * an editor's review, a targeted rewrite, and (only when the first review found
   * serious problems) a second review and a final polish. Progress is saved after
   * every stage so a retry never starts over.
   */
  async writeManuscript(outline: Outline, ctx: StoryContext, opts: ManuscriptOptions = {}): Promise<WithUsage<ManuscriptResult>> {
    const n = ctx.options.length;
    const usages: Usage[] = [];
    const run = async <T>(r: Promise<WithUsage<T>>) => {
      const out = await r;
      usages.push(out.usage);
      return out.value;
    };
    const verse = (pages: Array<{ pageNumber: number; text: string }>) => verseProblems(pages, ctx.options.voice, ctx.options.readingLevel);
    const resume = opts.resume && opts.resume.pages.length === n ? opts.resume : null;
    let manuscript: Manuscript = resume ? { pages: resume.pages, dedication: resume.dedication, backCoverBlurb: resume.backCoverBlurb } : (null as unknown as Manuscript);
    const editorNotes: EditorReport[] = resume ? [...resume.editorNotes] : [];
    const save = async (stage: DraftCheckpoint["stage"]) => opts.save?.({ stage, ...manuscript, editorNotes });

    if (!resume) {
      await opts.onStage?.("writing");
      manuscript = cleanManuscript(
        await run(
          this.claude.generate({
            label: "manuscript",
            system: STORY_SYSTEM_PROMPT,
            build: (p) => manuscriptPrompt(ctx, outline, p),
            wire: WireManuscript,
            schema: ManuscriptSchema,
            extraCheck: (m) => numberingProblems(m.pages, n),
            softCheck: (m) => verse(m.pages),
            maxTokens: 48000,
          }),
        ),
      );
      await save("written");
    }

    const review = () =>
      run(
        this.claude.generate({
          label: "editor",
          system: EDITOR_SYSTEM_PROMPT,
          build: () => editorPrompt(ctx, outline, manuscript.pages),
          wire: WireEditor,
          schema: EditorReportSchema,
          maxTokens: 24000,
          effort: this.lightEffort,
        }),
      );
    const patch = async (report: EditorReport, mode: "rewrite" | "polish") => {
      const p = await run(
        this.claude.generate({
          label: mode,
          system: STORY_SYSTEM_PROMPT,
          build: (problems) => rewritePrompt(ctx, outline, manuscript.pages, report.issues, problems, mode),
          wire: WirePatch,
          schema: PatchSchema,
          extraCheck: (x) => {
            const bad = x.pages.filter((pg) => pg.pageNumber < 1 || pg.pageNumber > n).map((pg) => pg.pageNumber);
            return bad.length ? [`Only pages 1 to ${n} exist (you returned ${bad.join(", ")}).`] : [];
          },
          softCheck: (x) => verse(applyPatch(manuscript, x).pages),
          maxTokens: 32000,
          // The first rewrite fixes real story problems; the final polish only touches up.
          effort: mode === "polish" ? this.lightEffort : undefined,
        }),
      );
      manuscript = cleanManuscript(applyPatch(manuscript, p));
    };
    const needsWork = (r: EditorReport) => r.verdict === "revise" && r.issues.length > 0;
    const hasMajor = (r: EditorReport) => r.issues.some((i) => i.severity !== "minor");
    const heroName = ctx.child.nickname || ctx.child.firstName;
    // Plain-code continuity slips (new glasses mid-adventure, a fox called a puppy) always go to the rewrite, as major.
    const withSlips = (r: EditorReport): EditorReport => {
      const slips = continuityProblems(manuscript.pages, outline, heroName, ctx.appearance?.hero).map((x) => ({ ...x, severity: "major" as const }));
      return slips.length ? { ...r, verdict: "revise", issues: [...slips, ...r.issues].slice(0, 12) } : r;
    };

    const stage = resume?.stage ?? "written";
    if (stage === "written") {
      await opts.onStage?.("editing");
      const first = withSlips(await review());
      editorNotes.push(first);
      if (needsWork(first)) await patch(first, "rewrite");
      await save(needsWork(first) && hasMajor(first) ? "rewritten" : "done");
      if (!(needsWork(first) && hasMajor(first))) return this.finishManuscript(ctx, manuscript, editorNotes, usages);
    }
    if (stage === "written" || stage === "rewritten" || stage === "reviewed") {
      // Only after serious problems: check the rewrite, then a light final polish.
      await opts.onStage?.("polishing");
      const second = withSlips(await review());
      editorNotes.push(second);
      if (needsWork(second)) await patch(second, "polish");
      await save("done");
    }
    return this.finishManuscript(ctx, manuscript, editorNotes, usages);
  }

  private finishManuscript(ctx: StoryContext, m: Manuscript, editorNotes: EditorReport[], usages: Usage[]): WithUsage<ManuscriptResult> {
    return {
      value: { pages: m.pages, dedication: ctx.options.dedication || m.dedication, backCoverBlurb: m.backCoverBlurb, editorNotes },
      usage: sumUsage(this.name, usages),
    };
  }

  /** The words, then the picture plans (used when parents don't review the story first). */
  async generatePages(outline: Outline, ctx: StoryContext, opts: ManuscriptOptions = {}): Promise<WithUsage<StoryPagesResult>> {
    const n = ctx.options.length;
    const written = await this.writeManuscript(outline, ctx, opts);
    const art = await this.directArt(outline, written.value.pages, ctx);
    const textByPage = new Map(written.value.pages.map((p) => [p.pageNumber, p.text]));
    const pages: StoryPage[] = art.value.pages
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((p) => ({ pageNumber: p.pageNumber, text: textByPage.get(p.pageNumber) ?? "", scene: p.scene, layout: p.layout, textZone: p.textZone }));
    const problems = validateStoryPages(pages, n);
    if (problems.length) throw new Error(`The story pages didn't line up: ${problems.join(" ")}`);
    return {
      value: {
        pages,
        dedication: written.value.dedication,
        backCoverBlurb: written.value.backCoverBlurb,
        coverScene: art.value.coverScene,
        storySummary: art.value.storySummary,
        editorNotes: written.value.editorNotes,
      },
      usage: sumUsage(this.name, [written.usage, art.usage]),
    };
  }

  /** Picture plans for the words as they now stand (also used after a parent edits the story). */
  async directArt(outline: Outline, pages: ArtInputPage[], ctx: StoryContext): Promise<WithUsage<ArtDirection>> {
    const n = ctx.options.length;
    const manuscriptPages = pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    const res = await this.claude.generate({
      label: "art direction",
      system: ART_SYSTEM_PROMPT,
      effort: this.lightEffort,
      build: (p) => artDirectionPrompt(ctx, outline, manuscriptPages, p),
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
      softCheck: (a) => earlyPropProblems(a.pages, manuscriptPages, a.props),
      maxTokens: 64000,
    });
    return { usage: res.usage, value: { pages: res.value.pages, coverScene: res.value.coverScene, storySummary: res.value.storySummary } };
  }

  /** Rewrites the chosen pages from the parent's note; returns only pages that changed. */
  async revisePages(outline: Outline, pages: Array<{ pageNumber: number; text: string }>, target: number[], instruction: string, ctx: StoryContext): Promise<WithUsage<{ pages: Array<{ pageNumber: number; text: string }> }>> {
    const n = ctx.options.length;
    const wanted = new Set(target);
    const issues = target.map((page) => ({ page, problem: "The parent asked for a change to this page.", fix: instruction }));
    const res = await this.claude.generate({
      label: "rewrite pages",
      system: STORY_SYSTEM_PROMPT,
      build: (problems) =>
        rewritePrompt(ctx, outline, pages, issues, [...(problems ?? []), `Change ONLY pages ${target.join(", ")}. Every other page stays exactly as it is, so make the changed pages fit the pages around them.`]),
      wire: WirePatch,
      schema: PatchSchema,
      extraCheck: (x) => {
        const bad = x.pages.filter((pg) => pg.pageNumber < 1 || pg.pageNumber > n).map((pg) => pg.pageNumber);
        return bad.length ? [`Only pages 1 to ${n} exist (you returned ${bad.join(", ")}).`] : [];
      },
      softCheck: (x) => verseProblems(x.pages.filter((pg) => wanted.has(pg.pageNumber)), ctx.options.voice, ctx.options.readingLevel),
      maxTokens: 32000,
    });
    const changed = res.value.pages.filter((pg) => wanted.has(pg.pageNumber)).map((pg) => ({ pageNumber: pg.pageNumber, text: cleanDashes(pg.text) }));
    return { usage: res.usage, value: { pages: changed } };
  }

  async reviseText(page: { text: string; scene: Scene | null }, instruction: string, ctx: StoryContext): Promise<WithUsage<{ text: string }>> {
    const res = await this.claude.generate({
      label: "revise",
      system: STORY_SYSTEM_PROMPT,
      build: () => revisePrompt(page.text, page.scene?.action ?? null, instruction, ctx),
      wire: WireRevision,
      schema: z.object({ text: z.string().min(1).max(900) }),
      maxTokens: 8000,
    });
    return { ...res, value: { text: cleanDashes(res.value.text) } };
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
