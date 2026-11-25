import type { GenerationJob, Prisma } from "@prisma/client";
import { db } from "../../db";
import { getStorage, keys } from "../../storage";
import { getImageProvider, getStoryProvider } from "../../providers/registry";
import { MockStoryProvider } from "../../providers/story/mock";
import { PermanentProviderError, type ImageData } from "../../providers/types";
import { toReference } from "../../images/process";
import { getConfig } from "../../config";
import type { ArtStyle } from "../../schemas/theme";
import type { JobOutcome } from "../types";

function extFor(mime: string) {
  return mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpg" : "png";
}

export async function loadImage(key: string): Promise<ImageData> {
  const obj = await getStorage().get(key);
  if (!obj) throw new PermanentProviderError(`Stored image is missing (${key.split("/").pop()})`);
  const sharp = (await import("sharp")).default;
  if (obj.meta.contentType === "image/svg+xml") return { data: obj.data, mimeType: obj.meta.contentType, width: 1024, height: 1024 };
  const m = await sharp(obj.data).metadata();
  return { data: obj.data, mimeType: obj.meta.contentType, width: m.width ?? 0, height: m.height ?? 0 };
}

async function loadSheet(job: GenerationJob) {
  const sheetId = (job.payload as { sheetId?: string }).sheetId;
  const sheet = sheetId ? await db.characterSheet.findUnique({ where: { id: sheetId }, include: { child: { include: { photos: true } } } }) : null;
  if (!sheet) throw new PermanentProviderError("Character sheet no longer exists");
  return sheet;
}

/** Draws N character options from the child's photos. Raw photos are used only here. */
export async function sheetHandler(job: GenerationJob): Promise<JobOutcome> {
  const sheet = await loadSheet(job);
  const photos = await Promise.all(sheet.child.photos.map((p) => loadImage(p.storageKey).then(toReference)));
  if (!photos.length) throw new PermanentProviderError("No photos to draw from. Add a photo and try again.");
  const { value, usage } = await getImageProvider().generateCharacterSheet({
    subject: sheet.child.kind === "grownup" ? "grownup" : "child",
    photos,
    style: sheet.style as ArtStyle,
    outfit: sheet.outfit ?? undefined,
    hairLength: sheet.child.kind === "grownup" ? (sheet.child.hairLength ?? undefined) : undefined,
    count: getConfig().CHARACTER_SHEET_OPTIONS,
  });
  const imageKeys: string[] = [];
  for (const [i, img] of value.entries()) {
    const key = keys.sheetImage(sheet.child.userId, sheet.childId, sheet.id, i, extFor(img.mimeType));
    await getStorage().put(key, img.data, img.mimeType);
    imageKeys.push(key);
  }
  await db.characterSheet.update({
    where: { id: sheet.id },
    data: { imageKeys: imageKeys as unknown as Prisma.InputJsonValue, status: "draft", costUsd: usage.costUsd, error: null },
  });
  return { usage, result: { options: imageKeys.length } };
}

/** Describes the approved character in a fixed format the parent can correct. */
export async function bibleHandler(job: GenerationJob): Promise<JobOutcome> {
  const sheet = await loadSheet(job);
  if (sheet.selectedIndex == null) throw new PermanentProviderError("No option selected");
  const image = await loadImage((sheet.imageKeys as string[])[sheet.selectedIndex]);
  // Placeholder (SVG) art can't be read by a vision model; describe it with the mock.
  const provider = image.mimeType === "image/svg+xml" ? new MockStoryProvider() : getStoryProvider();
  const { value, usage } = await provider.describeCharacter(await toReference(image));
  // Never overwrite corrections the parent already saved.
  await db.characterSheet.updateMany({
    where: { id: sheet.id, bibleStatus: { not: "ready" } },
    data: { bible: value as unknown as Prisma.InputJsonValue, bibleStatus: "ready" },
  });
  return { usage };
}
