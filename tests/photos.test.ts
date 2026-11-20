import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hasMetadata, normalizePhoto, PhotoProblem, toReference } from "@/lib/images/process";
import { SharpUpscaler } from "@/lib/providers/upscale/sharp";

async function photoWithExif(w: number, h: number, orientation?: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#c0a080" } })
    .jpeg()
    .withMetadata({ ...(orientation ? { orientation } : {}), exif: { IFD0: { Make: "TestPhone", ImageDescription: "secret place" } } })
    .toBuffer();
}

describe("photo intake processing", () => {
  it("strips EXIF (including any location) and re-encodes as JPEG", async () => {
    const input = await photoWithExif(900, 1200);
    expect(await hasMetadata(input)).toBe(true);
    const out = await normalizePhoto(input);
    expect(out.mimeType).toBe("image/jpeg");
    expect(await hasMetadata(out.data)).toBe(false);
    expect(out.data.includes(Buffer.from("secret place"))).toBe(false);
  });

  it("applies EXIF rotation before stripping it", async () => {
    const out = await normalizePhoto(await photoWithExif(1200, 900, 6));
    expect([out.width, out.height]).toEqual([900, 1200]);
  });

  it("downsizes large photos and rejects small ones or non-images", async () => {
    const big = await normalizePhoto(await photoWithExif(4000, 3000));
    expect(Math.max(big.width, big.height)).toBe(2048);
    await expect(normalizePhoto(await photoWithExif(300, 400))).rejects.toBeInstanceOf(PhotoProblem);
    await expect(normalizePhoto(Buffer.from("this is not an image at all"))).rejects.toBeInstanceOf(PhotoProblem);
    const gif = Buffer.from("GIF89a" + "x".repeat(20));
    await expect(normalizePhoto(gif)).rejects.toThrow(/JPG, PNG or HEIC/);
  });

  it("recognizes HEIC by its bytes", async () => {
    // A HEIC header with no real image data: detected as HEIC, then fails to decode.
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]);
    const err = await normalizePhoto(fake).catch((e) => e);
    expect(String(err.message)).not.toMatch(/JPG, PNG or HEIC/);
  });

  it("shrinks references for providers", async () => {
    const img = await normalizePhoto(await photoWithExif(2048, 2048));
    const ref = await toReference(img);
    expect(Math.max(ref.width, ref.height)).toBe(1536);
  });
});

describe("sharp upscaler", () => {
  it("produces exact print pixels at 300 ppi", async () => {
    const src = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const r = await new SharpUpscaler().upscale({ data: src, mimeType: "image/png", width: 2048, height: 2048 }, { widthPx: 2625, heightPx: 2625 });
    const m = await sharp(r.value.data).metadata();
    expect([m.width, m.height]).toEqual([2625, 2625]);
    expect(m.density).toBe(300);
    expect(m.space).toBe("srgb");
  });
});
