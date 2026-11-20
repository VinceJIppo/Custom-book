import { getConfig } from "../config";
import type { StoryProvider } from "./story/types";
import type { ImageProvider } from "./image/types";
import type { Upscaler } from "./upscale/types";
import type { ModerationProvider } from "./moderation/types";
import type { PrintProvider } from "./print/types";
import type { VisionProvider } from "./vision/types";
import { MockStoryProvider } from "./story/mock";
import { MockImageProvider } from "./image/mock";
import { MockUpscaler } from "./upscale/mock";
import { SharpUpscaler } from "./upscale/sharp";
import { MockModerationProvider } from "./moderation/mock";
import { MockVisionProvider } from "./vision/mock";
import { MockPrintProvider } from "./print/mock";
import { PrintRouter } from "./print/router";
import { AnthropicStoryProvider } from "./anthropic/story";
import { AnthropicVisionProvider } from "./anthropic/vision";
import { AnthropicModerationProvider } from "./anthropic/moderation";
import { GeminiImageProvider } from "./gemini/image";
import { OpenAIImageProvider } from "./openai/image";

/**
 * The one place that picks provider implementations. "auto" uses a real
 * provider when its key is configured and falls back to the Mock otherwise, so
 * the app always runs with zero keys.
 */
interface Providers {
  story?: StoryProvider;
  image?: ImageProvider;
  upscaler?: Upscaler;
  moderation?: ModerationProvider;
  vision?: VisionProvider;
  printRouter?: PrintRouter;
}
let cache: Providers = {};

function requireKey(name: string, key: string | undefined, provider: string): string {
  if (!key) throw new Error(`${name} is set to ${provider} but its API key is missing.`);
  return key;
}

export function getStoryProvider(): StoryProvider {
  if (cache.story) return cache.story;
  const c = getConfig();
  const real = c.STORY_PROVIDER === "anthropic" || (c.STORY_PROVIDER === "auto" && !!c.ANTHROPIC_API_KEY);
  cache.story = real
    ? new AnthropicStoryProvider({
        apiKey: requireKey("STORY_PROVIDER", c.ANTHROPIC_API_KEY, "anthropic"),
        model: c.STORY_MODEL,
        effort: c.STORY_EFFORT,
        fallbacks: c.STORY_FALLBACKS,
      })
    : new MockStoryProvider();
  return cache.story;
}

export function imageProviderChoice(): "mock" | "gemini" | "openai" {
  const c = getConfig();
  if (c.IMAGE_PROVIDER !== "auto") return c.IMAGE_PROVIDER;
  if (c.GEMINI_API_KEY) return "gemini";
  if (c.OPENAI_API_KEY) return "openai";
  return "mock";
}

/** Builds a specific image provider (used by the comparison script too). */
export function buildImageProvider(which: "mock" | "gemini" | "openai"): ImageProvider {
  const c = getConfig();
  if (which === "gemini") return new GeminiImageProvider({ apiKey: requireKey("IMAGE_PROVIDER", c.GEMINI_API_KEY, "gemini"), model: c.GEMINI_IMAGE_MODEL, pageSize: c.GEMINI_PAGE_SIZE });
  if (which === "openai") return new OpenAIImageProvider({ apiKey: requireKey("IMAGE_PROVIDER", c.OPENAI_API_KEY, "openai"), model: c.OPENAI_IMAGE_MODEL, quality: c.OPENAI_IMAGE_QUALITY });
  return new MockImageProvider();
}

export function getImageProvider(): ImageProvider {
  return (cache.image ??= buildImageProvider(imageProviderChoice()));
}

export function getUpscaler(): Upscaler {
  if (cache.upscaler) return cache.upscaler;
  const c = getConfig();
  const which = c.UPSCALER === "auto" ? (imageProviderChoice() === "mock" ? "mock" : "sharp") : c.UPSCALER;
  return (cache.upscaler = which === "sharp" ? new SharpUpscaler() : new MockUpscaler());
}

function claudeAvailable(setting: "auto" | "mock" | "anthropic") {
  const c = getConfig();
  if (setting === "anthropic") requireKey("provider", c.ANTHROPIC_API_KEY, "anthropic");
  return setting === "anthropic" || (setting === "auto" && !!c.ANTHROPIC_API_KEY);
}

export function getVisionProvider(): VisionProvider {
  if (cache.vision) return cache.vision;
  const c = getConfig();
  cache.vision = claudeAvailable(c.VISION_PROVIDER)
    ? new AnthropicVisionProvider({ apiKey: c.ANTHROPIC_API_KEY, model: c.VISION_MODEL, effort: c.VISION_EFFORT, fallbacks: c.STORY_FALLBACKS })
    : new MockVisionProvider();
  return cache.vision;
}

export function getModeration(): ModerationProvider {
  if (cache.moderation) return cache.moderation;
  const c = getConfig();
  cache.moderation = claudeAvailable(c.MODERATION_PROVIDER)
    ? new AnthropicModerationProvider({ apiKey: c.ANTHROPIC_API_KEY, model: c.VISION_MODEL, effort: "low", fallbacks: c.STORY_FALLBACKS })
    : new MockModerationProvider();
  return cache.moderation;
}

export function getPrintRouter(): PrintRouter {
  return (cache.printRouter ??= new PrintRouter([new MockPrintProvider()] as PrintProvider[]));
}

/** For tests: reset, or swap in specific implementations. */
export function resetProviders(overrides: Providers = {}) {
  cache = { ...overrides };
}

export function activeProviderNames() {
  const c = getConfig();
  const story = getStoryProvider().name;
  const image = getImageProvider();
  return {
    story,
    storyModel: story === "mock" ? "mock" : c.STORY_MODEL,
    image: image.name,
    imageModel: image.model,
    upscaler: getUpscaler().name,
    vision: getVisionProvider().name,
    moderation: getModeration().name,
    print: "mock",
  };
}
