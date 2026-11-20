import type { ImageData, WithUsage } from "../types";

export interface Upscaler {
  readonly name: string;
  upscale(image: ImageData, target: { widthPx: number; heightPx: number }): Promise<WithUsage<ImageData>>;
}
