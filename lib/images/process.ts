import sharp from "sharp";
import type { ImageData } from "../providers/types";

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** Shortest edge a photo needs for a good likeness. */
export const MIN_PHOTO_EDGE = 512;
/** Photos are stored no larger than this (long edge). */
const STORED_PHOTO_EDGE = 2048;
/** References sent to image providers are no larger than this (long edge). */
const REFERENCE_EDGE = 1536;

export class PhotoProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoProblem";
  }
}

function sniffType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand)) return "image/heic";
  }
  return null;
}

/**
 * Normalizes an uploaded photo: detects the real type from its bytes (not the
 * file name), converts HEIC, applies EXIF rotation, then re-encodes as JPEG,
 * which drops all metadata including GPS location.
 */
export async function normalizePhoto(input: Buffer): Promise<ImageData> {
  if (input.length > MAX_PHOTO_BYTES) throw new PhotoProblem("That photo is larger than 20 MB. Please choose a smaller one.");
  const type = sniffType(input);
  if (!type) throw new PhotoProblem("Please upload a JPG, PNG or HEIC photo.");
  let buf = input;
  if (type === "image/heic") {
    const { default: convert } = await import("heic-convert");
    buf = Buffer.from(await convert({ buffer: input, format: "JPEG", quality: 0.92 }));
  }
  let img = sharp(buf, { failOn: "error" }).rotate();
  const meta = await img.metadata();
  const oriented = meta.orientation && meta.orientation >= 5 ? { w: meta.height ?? 0, h: meta.width ?? 0 } : { w: meta.width ?? 0, h: meta.height ?? 0 };
  if (Math.min(oriented.w, oriented.h) < MIN_PHOTO_EDGE) {
    throw new PhotoProblem(`This photo is too small (${oriented.w}x${oriented.h}). Please use one at least ${MIN_PHOTO_EDGE} pixels on each side.`);
  }
  img = img.resize(STORED_PHOTO_EDGE, STORED_PHOTO_EDGE, { fit: "inside", withoutEnlargement: true }).toColorspace("srgb");
  const { data, info } = await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data, mimeType: "image/jpeg", width: info.width, height: info.height };
}

/** Downscales an image for use as a reference input (keeps provider costs and payloads small). */
export async function toReference(image: ImageData): Promise<ImageData> {
  if (image.mimeType === "image/svg+xml") return image;
  if (Math.max(image.width, image.height) <= REFERENCE_EDGE && (image.mimeType === "image/png" || image.mimeType === "image/jpeg")) return image;
  const { data, info } = await sharp(image.data)
    .resize(REFERENCE_EDGE, REFERENCE_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { data, mimeType: "image/jpeg", width: info.width, height: info.height };
}

/** True if the buffer still carries EXIF/XMP metadata. Used by tests and as a safety check. */
export async function hasMetadata(buf: Buffer): Promise<boolean> {
  const m = await sharp(buf).metadata();
  return !!(m.exif || m.xmp || m.iptc);
}
