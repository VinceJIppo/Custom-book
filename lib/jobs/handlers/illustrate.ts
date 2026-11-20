import type { Book, GenerationJob, Page, Prisma } from "@prisma/client";
import { db } from "../../db";
import { getConfig } from "../../config";
import { getImageProvider, getUpscaler, getVisionProvider } from "../../providers/registry";
import { getStorage, keys } from "../../storage";
import { storyContextFor } from "../../books/context";
import { CharacterBibleSchema, SceneSchema, type CharacterBible, type Layout, type Scene, type TextZone } from "../../schemas/story";
import { getTrim, illustrationTargetPx } from "../../print/geometry";
import { PermanentProviderError, sumUsage, type ImageData, type Usage } from "../../providers/types";
import { toReference } from "../../images/process";
import { maybeFinalizeBook } from "./finalize";
import { loadImage } from "./characters";
import { snapshotPage } from "../../books/pages";
import type { JobOutcome } from "../types";
import type { ArtStyle } from "../../schemas/theme";

function extFor(mime: string) {
  return mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

interface CharacterRef {
  image: ImageData;
  bible: CharacterBible | null;
}

/** The book's approved character (reference image + bible), or null. */
export async function characterFor(book: Book): Promise<CharacterRef | null> {
  if (!book.characterSheetId) return null;
  const sheet = await db.characterSheet.findUnique({ where: { id: book.characterSheetId } });
  if (!sheet || sheet.selectedIndex == null) return null;
  const key = (sheet.imageKeys as string[])[sheet.selectedIndex];
  if (!key) return null;
  const bible = sheet.bible ? CharacterBibleSchema.safeParse(sheet.bible) : null;
  return { image: await toReference(await loadImage(key)), bible: bible?.success ? bible.data : null };
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
 * Draws one illustration with the character reference, checks the likeness,
 * retries once with the specific drift as a correction, and flags the page if
 * it still drifts. Then upscales to exact print pixels.
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
}): Promise<RenderResult> {
  const { book } = args;
  const ctx = storyContextFor(book);
  const trim = getTrim(book.trimSize);
  const target = illustrationTargetPx(args.layout, trim);
  const aspect = args.aspectOverride ?? target.aspect;
  const character = await characterFor(book);
  const childName = ctx.child.nickname || ctx.child.firstName;
  const image = getImageProvider();
  const usages: Usage[] = [];

  const draw = async (extraNote?: string) => {
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
        });
    usages.push(r.usage);
    return r.value;
  };

  let working = await draw();
  let qaScore: number | null = null;
  let qaIssues: string[] = [];
  let flagged = false;

  const canCheck = getConfig().CONSISTENCY_QA && working.mimeType !== "image/svg+xml" && args.scene.characters.some((c) => c.toLowerCase().includes(childName.toLowerCase()) || c.toLowerCase().includes(ctx.child.firstName.toLowerCase()));
  if (canCheck && character) {
    const vision = getVisionProvider();
    const check = async (img: ImageData) => {
      const r = await vision.compareCharacter({ sheet: character.image, page: await toReference(img), bible: character.bible, childName });
      usages.push(r.usage);
      return r.value;
    };
    let result = await check(working);
    if (!result.consistent) {
      // One automatic retry, telling the model exactly what drifted.
      const fix = `Important correction: ${childName} must match the character sheet. Fix: ${result.issues.join("; ") || "match the face, hair and skin tone"}.`;
      const second = await draw(fix);
      const secondResult = await check(second);
      if (secondResult.score >= result.score) {
        working = second;
        result = secondResult;
      }
    }
    qaScore = result.score;
    qaIssues = result.issues;
    flagged = !result.consistent;
  }

  const up = await getUpscaler().upscale(working, { widthPx: target.widthPx, heightPx: target.heightPx });
  usages.push(up.usage);
  return { working, print: up.value, qaScore, qaIssues, flagged, usage: sumUsage(image.name, usages) };
}

async function storeRender(book: Book, page: Page, version: number, r: RenderResult) {
  const storage = getStorage();
  const printKey = keys.pageImage(book.userId, book.childId, book.id, page.id, version, extFor(r.print.mimeType));
  await storage.put(printKey, r.print.data, r.print.mimeType);
  let workingKey = printKey;
  if (r.working.data !== r.print.data) {
    workingKey = keys.pageWorking(book.userId, book.childId, book.id, page.id, version, extFor(r.working.mimeType));
    await storage.put(workingKey, r.working.data, r.working.mimeType);
  }
  return { printKey, workingKey };
}

function pageUpdate(r: RenderResult, keys: { printKey: string; workingKey: string }) {
  return {
    imageKey: keys.printKey,
    workingImageKey: keys.workingKey,
    imageStatus: r.flagged ? "flagged" : "ready",
    qaScore: r.qaScore,
    qaIssues: r.qaIssues as unknown as Prisma.InputJsonValue,
  };
}

async function loadPage(job: GenerationJob) {
  const pageId = (job.payload as { pageId?: string }).pageId;
  const page = pageId ? await db.page.findUnique({ where: { id: pageId }, include: { book: true } }) : null;
  if (!page) throw new PermanentProviderError("Page no longer exists");
  return page;
}

/** First illustration for a story page, or a fresh redraw with an optional note. */
export async function illustrateHandler(job: GenerationJob): Promise<JobOutcome> {
  const page = await loadPage(job);
  const { note, redraw } = job.payload as { note?: string; redraw?: boolean };
  const version = redraw ? await snapshotPage(page.id, note ? `Redraw: ${note}` : "Redraw") : page.version;
  const r = await renderArt({
    book: page.book,
    scene: SceneSchema.parse(page.scene),
    layout: page.layout as Layout,
    textZone: page.layout === "textSpot" ? null : (page.textZone as TextZone),
    label: `Page ${page.storyNumber ?? page.index}`,
    note,
  });
  const stored = await storeRender(page.book, page, version, r);
  await db.page.update({ where: { id: page.id }, data: pageUpdate(r, stored) });
  await maybeFinalizeBook(page.book.id);
  return { usage: r.usage, result: { key: stored.printKey, qaScore: r.qaScore, flagged: r.flagged } };
}

/** Edit the current picture with a note ("make him smile"), keeping the composition. */
export async function editHandler(job: GenerationJob): Promise<JobOutcome> {
  const page = await loadPage(job);
  const { note } = job.payload as { note?: string };
  if (!note) throw new PermanentProviderError("No edit note");
  const sourceKey = page.workingImageKey ?? page.imageKey;
  if (!sourceKey) throw new PermanentProviderError("This page has no picture to edit yet");
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
  });
  const stored = await storeRender(page.book, page, version, r);
  await db.page.update({ where: { id: page.id }, data: pageUpdate(r, stored) });
  return { usage: r.usage, result: { key: stored.printKey, qaScore: r.qaScore, flagged: r.flagged } };
}

export async function coverHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = job.bookId ? await db.book.findUnique({ where: { id: job.bookId } }) : null;
  if (!book) throw new PermanentProviderError("Book no longer exists");
  const coverScene = SceneSchema.parse((book.outline as { coverScene?: unknown } | null)?.coverScene);
  const r = await renderArt({ book, scene: coverScene, layout: "fullBleed", textZone: "top", label: "Cover" });
  const ext = extFor(r.print.mimeType);
  const key = keys.coverImage(book.userId, book.childId, book.id, book.version, ext);
  await getStorage().put(key, r.print.data, r.print.mimeType);
  await db.book.update({ where: { id: book.id }, data: { coverImageKey: key } });
  await maybeFinalizeBook(book.id);
  return { usage: r.usage, result: { key, qaScore: r.qaScore } };
}
