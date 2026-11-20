import type { Upscaler } from "./types";
import type { ImageData, WithUsage } from "../types";

/** Mock upscaler: vector placeholders scale for free, so it only updates the size. */
export class MockUpscaler implements Upscaler {
  readonly name = "mock";
  async upscale(image: ImageData, target: { widthPx: number; heightPx: number }): Promise<WithUsage<ImageData>> {
    return {
      value: { ...image, width: target.widthPx, height: target.heightPx },
      usage: { provider: "mock", imageCalls: 1, costUsd: 0 },
    };
  }
}
