import type { Book, GenerationJob, Page, Prisma } from "@prisma/client";
import { errorMessage, log } from "../../log";
import { db } from "../../db";
import { getConfig } from "../../config";
import {
  getImageProvider,
  getUpscaler,
  getVisionProvider,
} from "../../providers/registry";
import { getStorage, keys } from "../../storage";
import { storyContextFor } from "../../books/context";
import {
  CharacterBibleSchema,
  SceneSchema,
  type CharacterBible,
  type Layout,
  type Scene,
  type TextZone,
} from "../../schemas/story";
import { getTrim, illustrationTargetPx } from "../../print/geometry";
import {
  PermanentProviderError,
  sumUsage,
  type ImageData,
  type Usage,
} from "../../providers/types";
import { toReference } from "../../images/process";
import { maybeFinalizeBook } from "./finalize";
import { loadImage } from "./characters";
import { snapshotPage } from "../../books/pages";
import type { JobOutcome } from "../types";
import type { ArtStyle } from "../../schemas/theme";
import type { CastRef, StoryContextForArt } from "../../providers/image/types";

function extFor(mime: string) {
  return mime === "image/svg+xml"
    ? "svg"
    : mime === "image/jpeg"
      ? "jpg"
      : mime === "image/webp"
        ? "webp"
        : "png";
}

interface CharacterRef {
  image: ImageData;
  bible: CharacterBible | null;
}

/** The book's approved character (reference image + bible), or null. */
export async function characterFor(book: Book): Promise<CharacterRef | null> {
  if (!book.characterSheetId) return null;
  const sheet = await db.characterSheet.findUnique({
    where: { id: book.characterSheetId },
  });
  if (!sheet || sheet.selectedIndex == null) return null;
  const key = (sheet.imageKeys as string[])[sheet.selectedIndex];
  if (!key) return null;
  const bible = sheet.bible
    ? CharacterBibleSchema.safeParse(sheet.bible)
    : null;
  return {
    image: await toReference(await loadImage(key)),
    bible: bible?.success ? bible.data : null,
  };
}

/**
 * Character references for the other real people who appear in this scene
 * (matched by name in the scene's characters or action). Their sheets go to
 * the image model after the hero's; people without one are described in words.
 */
export async function castRefsFor(
  ctx: ReturnType<typeof storyContextFor>,
  scene: Scene,
  heroName: string,
): Promise<CastRef[]> {
  const people = ctx.cast ?? [];
  if (!people.length) return [];
  const haystack = [
    scene.action,
    ...scene.characters,
    ...(scene.mustShow ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const refs: CastRef[] = [];
  for (const m of people) {
    const names = [m.nickname, m.name, m.relationship].filter(
      (x): x is string => !!x,
    );
    const mentioned = names.some((n) =>
      new RegExp(
        `(^|[^\\p{L}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`,
        "u",
      ).test(haystack),
    );
    if (!mentioned) continue;
    let image: ImageData | null = null;
    let bible: CharacterBible | null = null;
    if (m.characterSheetId) {
      const sheet = await db.characterSheet.findUnique({
        where: { id: m.characterSheetId },
      });
      const key =
        sheet && sheet.selectedIndex != null
          ? (sheet.imageKeys as string[])[sheet.selectedIndex]
          : null;
      if (key) image = await toReference(await loadImage(key));
      const parsed = sheet?.bible
        ? CharacterBibleSchema.safeParse(sheet.bible)
        : null;
      bible = parsed?.success ? parsed.data : null;
    }
    refs.push({
      name: m.nickname || m.name,
      label:
        m.kind === "grownup"
          ? `${heroName}'s ${m.relationship?.toLowerCase() ?? "grown-up"}`
          : `${heroName}'s friend`,
      image,
      bible,
      look: m.look,
    });
  }
  return refs.slice(0, 3);
}

export interface RenderResult {
  working: ImageData;
  print: ImageData;
  qaScore: number | null;
  qaIssues: string[];
  flagged: boolean;
  usage: Usage;
}

/**
 * Draws one illustration with the character reference and the whole-story
 * context, then checks it: does the hero match the character sheet, and does
 * the picture show what the words say? If either check fails, it redraws once
 * with the specific problems as corrections, keeps the better picture, and
 * flags the page for the parent if it still fails. Then upscales to print pixels.
 */
export async function renderArt(args: {
  book: Book;
  scene: Scene;
  layout: Layout;
  textZone: TextZone | null;
  label: string;
  note?: string;
  /** When editing, the current working image to modify. */
  editFrom?: ImageData;
  aspectOverride?: number;
  /** Story summary, this page's words and the neighboring moments. */
  story?: StoryContextForArt;
  /** Pictures already drawn (and paid for) by earlier tries of the same job. */
  priorDraws?: number;
}): Promise<RenderResult> {
  const { book } = args;
  const ctx = storyContextFor(book);
  const trim = getTrim(book.trimSize);
  const target = illustrationTargetPx(args.layout, trim);
  const aspect = args.aspectOverride ?? target.aspect;
  const character = await characterFor(book);
  const childName = ctx.child.nickname || ctx.child.firstName;
  const cast = await castRefsFor(ctx, args.scene, childName);
  const image = getImageProvider();
  const usages: Usage[] = [];
  let draws = 0;
  const maxDraws = getConfig().MAX_DRAWS_PER_PICTURE;
  // drawsCounted marks usage whose imageCalls is the exact number of pictures drawn.
  const spent = (): Usage =>
    ({
      ...sumUsage(image.name, usages),
      imageCalls: draws,
      drawsCounted: true,
    }) as Usage;

  const draw = async (extraNote?: string) => {
    // Hard stop: every drawn picture is paid for, including ones a retry throws away.
    if ((args.priorDraws ?? 0) + draws >= maxDraws) {
      throw Object.assign(
        new PermanentProviderError(
          `This picture was already drawn ${(args.priorDraws ?? 0) + draws} times without finishing, so we stopped to avoid more charges. Redraw it later from the page editor.`,
        ),
        { usage: spent() },
      );
    }
    const note = [args.note, extraNote].filter(Boolean).join(" ") || undefined;
    const r = args.editFrom
      ? await image.editIllustration({
          image: await toReference(args.editFrom),
          instruction: note ?? "Improve the picture.",
          characterRef: character?.image ?? null,
          style: book.style as ArtStyle,
          childName,
          textZone: args.textZone,
          targetPx: target,
        })
      : await image.generateIllustration({
          characterRef: character?.image ?? null,
          bible: character?.bible ?? null,
          childName,
          scene: args.scene,
          style: book.style as ArtStyle,
          aspect,
          targetPx: target,
          textZone: args.textZone,
          palette: ctx.theme.artDirection.palette,
          label: args.label,
          note,
          story: args.story,
          cast,
        });
    usages.push(r.usage);
    draws++;
    return r.value;
  };

  try {
    let working = await draw();
    let qaScore: number | null = null;
    let qaIssues: string[] = [];
    let flagged = false;

    const heroInScene = args.scene.characters.some(
      (c) =>
        c.toLowerCase().includes(childName.toLowerCase()) ||
        c.toLowerCase().includes(ctx.child.firstName.toLowerCase()),
    );
    const canCheck =
      getConfig().CONSISTENCY_QA && working.mimeType !== "image/svg+xml";
    if (canCheck) {
      const vision = getVisionProvider();
      const sheet = heroInScene ? character : null;
      const check = async (img: ImageData) => {
        const r = await vision.checkPage({
          page: await toReference(img),
          sheet: sheet?.image ?? null,
          bible: sheet?.bible ?? null,
          childName,
          pageText: args.story?.pageText ?? "",
          mustShow: args.scene.mustShow ?? [],
          continuity: args.scene.continuity ?? "",
        });
        usages.push(r.usage);
        return r.value;
      };
      const scoreOf = (c: Awaited<ReturnType<typeof check>>) =>
        Math.min(c.likeness?.score ?? 1, c.story.score);
      // A failed check never costs a redraw: keep the picture, note it wasn't checked.
      const safeCheck = async (img: ImageData) => {
        try {
          return await check(img);
        } catch (err) {
          log.warn("Picture check failed; keeping the picture unchecked", {
            err: errorMessage(err),
          });
          return null;
        }
      };
      let result = await safeCheck(working);
      if (!result) {
        qaIssues = ["Not checked: the picture check was unavailable"];
      } else if (!result.ok) {
        // One automatic redraw, telling the model exactly what was wrong.
        const fixes: string[] = [];
        if (result.likeness && result.likeness.issues.length)
          fixes.push(
            `${childName} must match the character sheet: ${result.likeness.issues.join("; ")}.`,
          );
        else if (result.likeness && !result.ok)
          fixes.push(
            `${childName} must match the character sheet (face, hair and skin tone).`,
          );
        if (result.story.missing.length)
          fixes.push(
            `The picture must match the words on the page. Fix: ${result.story.missing.join("; ")}.`,
          );
        if ((args.priorDraws ?? 0) + draws < maxDraws) {
          const second = await draw(
            `Important corrections: ${fixes.join(" ")}`,
          );
          const secondResult = await safeCheck(second);
          if (!secondResult || scoreOf(secondResult) >= scoreOf(result)) {
            working = second;
            if (secondResult) result = secondResult;
          }
        }
      }
      if (result) {
        qaScore = scoreOf(result);
        qaIssues = [
          ...(result.likeness?.issues ?? []).map((i) => `Likeness: ${i}`),
          ...result.story.missing.map((m) => `Story: ${m}`),
        ];
        flagged = !result.ok;
      }
    }

    const up = await getUpscaler().upscale(working, {
      widthPx: target.widthPx,
      heightPx: target.heightPx,
    });
    usages.push(up.usage);
    return {
      working,
      print: up.value,
      qaScore,
      qaIssues,
      flagged,
      usage: spent(),
    };
  } catch (err) {
    // Keep the bill for pictures drawn before the failure, so spend and caps stay accurate.
    if (!(err as { usage?: Usage }).usage)
      Object.assign(err as object, { usage: spent() });
    throw err;
  }
}

async function storeRender(
  book: Book,
  page: Page,
  version: number,
  r: RenderResult,
) {
  const storage = getStorage();
  const printKey = keys.pageImage(
    book.userId,
    book.childId,
    book.id,
    page.id,
    version,
    extFor(r.print.mimeType),
  );
  await storage.put(printKey, r.print.data, r.print.mimeType);
  let workingKey = printKey;
  if (r.working.data !== r.print.data) {
    workingKey = keys.pageWorking(
      book.userId,
      book.childId,
      book.id,
      page.id,
      version,
      extFor(r.working.mimeType),
    );
    await storage.put(workingKey, r.working.data, r.working.mimeType);
  }
  return { printKey, workingKey };
}

function pageUpdate(
  r: RenderResult,
  keys: { printKey: string; workingKey: string },
) {
  return {
    imageKey: keys.printKey,
    workingImageKey: keys.workingKey,
    imageStatus: r.flagged ? "flagged" : "ready",
    qaScore: r.qaScore,
    qaIssues: r.qaIssues as unknown as Prisma.InputJsonValue,
  };
}

/** The whole-story context for one page: summary, its words, and what the pages around it show. */
async function storyFor(
  book: Book,
  page: Page | null,
): Promise<StoryContextForArt> {
  const summary = String(
    (book.outline as { storySummary?: unknown } | null)?.storySummary ?? "",
  );
  if (!page) return { summary, pageText: "" };
  const all = await db.page.findMany({
    where: { bookId: book.id, storyNumber: { not: null } },
    orderBy: { index: "asc" },
    select: { id: true, scene: true },
  });
  const i = all.findIndex((p) => p.id === page.id);
  const moment = (p?: { scene: unknown }) => {
    const parsed = p ? SceneSchema.safeParse(p.scene) : null;
    return parsed?.success ? parsed.data.action : undefined;
  };
  return {
    summary,
    pageText: page.text ?? "",
    previousMoment: i > 0 ? moment(all[i - 1]) : undefined,
    nextMoment: i >= 0 ? moment(all[i + 1]) : undefined,
  };
}

/** Pictures drawn by earlier tries of this job (recorded when a try fails). */
function priorDraws(job: GenerationJob) {
  return Number((job.usage as { imageCalls?: number } | null)?.imageCalls ?? 0);
}

async function loadPage(job: GenerationJob) {
  const pageId = (job.payload as { pageId?: string }).pageId;
  const page = pageId
    ? await db.page.findUnique({
        where: { id: pageId },
        include: { book: true },
      })
    : null;
  if (!page) throw new PermanentProviderError("Page no longer exists");
  return page;
}

/** First illustration for a story page, or a fresh redraw with an optional note. */
export async function illustrateHandler(
  job: GenerationJob,
): Promise<JobOutcome> {
  const page = await loadPage(job);
  const { note, redraw } = job.payload as { note?: string; redraw?: boolean };
  const version = redraw
    ? await snapshotPage(page.id, note ? `Redraw: ${note}` : "Redraw")
    : page.version;
  const r = await renderArt({
    book: page.book,
    scene: SceneSchema.parse(page.scene),
    layout: page.layout as Layout,
    textZone: page.layout === "textSpot" ? null : (page.textZone as TextZone),
    label: `Page ${page.storyNumber ?? page.index}`,
    note,
    story: await storyFor(page.book, page),
    priorDraws: priorDraws(job),
  });
  const stored = await storeRender(page.book, page, version, r);
  await db.page.update({ where: { id: page.id }, data: pageUpdate(r, stored) });
  await maybeFinalizeBook(page.book.id);
  return {
    usage: r.usage,
    result: { key: stored.printKey, qaScore: r.qaScore, flagged: r.flagged },
  };
}

/** Edit the current picture with a note ("make him smile"), keeping the composition. */
export async function editHandler(job: GenerationJob): Promise<JobOutcome> {
  const page = await loadPage(job);
  const { note } = job.payload as { note?: string };
  if (!note) throw new PermanentProviderError("No edit note");
  const sourceKey = page.workingImageKey ?? page.imageKey;
  if (!sourceKey)
    throw new PermanentProviderError("This page has no picture to edit yet");
  const source = await loadImage(sourceKey);
  const version = await snapshotPage(page.id, `Edit: ${note}`);
  const r = await renderArt({
    book: page.book,
    scene: SceneSchema.parse(page.scene),
    layout: page.layout as Layout,
    textZone: page.layout === "textSpot" ? null : (page.textZone as TextZone),
    label: `Page ${page.storyNumber ?? page.index}`,
    note,
    editFrom: source,
    story: await storyFor(page.book, page),
    priorDraws: priorDraws(job),
  });
  const stored = await storeRender(page.book, page, version, r);
  await db.page.update({ where: { id: page.id }, data: pageUpdate(r, stored) });
  return {
    usage: r.usage,
    result: { key: stored.printKey, qaScore: r.qaScore, flagged: r.flagged },
  };
}

export async function coverHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = job.bookId
    ? await db.book.findUnique({ where: { id: job.bookId } })
    : null;
  if (!book) throw new PermanentProviderError("Book no longer exists");
  const coverScene = SceneSchema.parse(
    (book.outline as { coverScene?: unknown } | null)?.coverScene,
  );
  const r = await renderArt({
    book,
    scene: coverScene,
    layout: "fullBleed",
    textZone: "top",
    label: "Cover",
    story: await storyFor(book, null),
    priorDraws: priorDraws(job),
  });
  const ext = extFor(r.print.mimeType);
  const key = keys.coverImage(
    book.userId,
    book.childId,
    book.id,
    book.version,
    ext,
  );
  await getStorage().put(key, r.print.data, r.print.mimeType);
  await db.book.update({
    where: { id: book.id },
    data: { coverImageKey: key },
  });
  await maybeFinalizeBook(book.id);
  return { usage: r.usage, result: { key, qaScore: r.qaScore } };
}
