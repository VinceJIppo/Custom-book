import sharp from "sharp";
import type { Upscaler } from "./types";
import type { ImageData, WithUsage } from "../types";
import { PRINT_PPI } from "../../print/geometry";

/**
 * Local upscaler: Lanczos resampling to the exact print size, center-cropped to
 * the target aspect, sRGB, tagged 300 ppi. Used when the image provider already
 * renders near print resolution (Gemini 2K/4K), so only small factors remain.
 * A hosted super-resolution model can replace it behind the same interface.
 */
export class SharpUpscaler implements Upscaler {
  readonly name = "sharp";

  async upscale(image: ImageData, target: { widthPx: number; heightPx: number }): Promise<WithUsage<ImageData>> {
    if (image.mimeType === "image/svg+xml") {
      // Vector placeholders need no resampling.
      return { value: { ...image, width: target.widthPx, height: target.heightPx }, usage: { provider: this.name, costUsd: 0 } };
    }
    const data = await sharp(image.data)
      .resize(target.widthPx, target.heightPx, { fit: "cover", position: "north", kernel: "lanczos3" })
      .toColorspace("srgb")
      .withMetadata({ density: PRINT_PPI })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { value: { data, mimeType: "image/png", width: target.widthPx, height: target.heightPx }, usage: { provider: this.name, costUsd: 0 } };
  }
}
