import type { GenerationJob } from "@prisma/client";
import { db } from "../../db";
import { getImageProvider } from "../../providers/registry";
import { getStorage, keys } from "../../storage";
import { storyContextFor } from "../../books/context";
import { SceneSchema, type Layout, type TextZone } from "../../schemas/story";
import { getTrim, illustrationTargetPx } from "../../print/geometry";
import { PermanentProviderError } from "../../providers/types";
import { maybeFinalizeBook } from "./finalize";
import type { JobOutcome } from "../types";
import type { ArtStyle } from "../../schemas/theme";

function extFor(mime: string) {
  return mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

export async function illustrateHandler(job: GenerationJob): Promise<JobOutcome> {
  const pageId = (job.payload as { pageId?: string }).pageId;
  const page = pageId ? await db.page.findUnique({ where: { id: pageId }, include: { book: true } }) : null;
  if (!page) throw new PermanentProviderError("Page no longer exists");
  const book = page.book;
  const ctx = storyContextFor(book);
  const scene = SceneSchema.parse(page.scene);
  const trim = getTrim(book.trimSize);
  const target = illustrationTargetPx(page.layout as Layout, trim);

  const { value: image, usage } = await getImageProvider().generateIllustration({
    characterRef: null,
    bible: null,
    childName: ctx.child.nickname || ctx.child.firstName,
    scene,
    style: book.style as ArtStyle,
    aspect: target.aspect,
    textZone: page.layout === "textSpot" ? null : (page.textZone as TextZone),
    palette: ctx.theme.artDirection.palette,
    label: `Page ${page.storyNumber ?? page.index}`,
  });

  const key = keys.pageImage(book.userId, book.childId, book.id, page.id, page.version, extFor(image.mimeType));
  await getStorage().put(key, image.data, image.mimeType);
  await db.page.update({ where: { id: page.id }, data: { imageKey: key, imageStatus: "ready" } });
  await maybeFinalizeBook(book.id);
  return { usage, result: { key, width: image.width, height: image.height } };
}

export async function coverHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = job.bookId ? await db.book.findUnique({ where: { id: job.bookId } }) : null;
  if (!book) throw new PermanentProviderError("Book no longer exists");
  const ctx = storyContextFor(book);
  const coverScene = SceneSchema.parse((book.outline as { coverScene?: unknown } | null)?.coverScene);
  const trim = getTrim(book.trimSize);
  const { value: image, usage } = await getImageProvider().generateIllustration({
    characterRef: null,
    bible: null,
    childName: ctx.child.nickname || ctx.child.firstName,
    scene: coverScene,
    style: book.style as ArtStyle,
    aspect: trim.widthIn / trim.heightIn,
    textZone: "top",
    palette: ctx.theme.artDirection.palette,
    label: "Cover",
  });
  const key = keys.coverImage(book.userId, book.childId, book.id, book.version, extFor(image.mimeType));
  await getStorage().put(key, image.data, image.mimeType);
  await db.book.update({ where: { id: book.id }, data: { coverImageKey: key } });
  await maybeFinalizeBook(book.id);
  return { usage, result: { key } };
}
