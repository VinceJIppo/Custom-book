import { getConfig } from "../config";
import type { StoryProvider } from "./story/types";
import type { ImageProvider } from "./image/types";
import type { Upscaler } from "./upscale/types";
import type { ModerationProvider } from "./moderation/types";
import type { PrintProvider } from "./print/types";
import { MockStoryProvider } from "./story/mock";
import { AnthropicStoryProvider } from "./story/anthropic";
import { MockImageProvider } from "./image/mock";
import { MockUpscaler } from "./upscale/mock";
import { MockModerationProvider } from "./moderation/mock";
import { MockPrintProvider } from "./print/mock";
import { PrintRouter } from "./print/router";

/**
 * The one place that picks provider implementations. "auto" uses the real
 * provider when its key is configured and falls back to the Mock otherwise, so
 * the app always runs with zero keys.
 */
let story: StoryProvider | null = null;
let image: ImageProvider | null = null;
let upscaler: Upscaler | null = null;
let moderation: ModerationProvider | null = null;
let printRouter: PrintRouter | null = null;

export function getStoryProvider(): StoryProvider {
  if (story) return story;
  const c = getConfig();
  const wantReal = c.STORY_PROVIDER === "anthropic" || (c.STORY_PROVIDER === "auto" && !!c.ANTHROPIC_API_KEY);
  if (c.STORY_PROVIDER === "anthropic" && !c.ANTHROPIC_API_KEY) {
    throw new Error("STORY_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
  }
  story = wantReal
    ? new AnthropicStoryProvider({ apiKey: c.ANTHROPIC_API_KEY, model: c.STORY_MODEL, effort: c.STORY_EFFORT, fallbacks: c.STORY_FALLBACKS })
    : new MockStoryProvider();
  return story;
}

export function getImageProvider(): ImageProvider {
  return (image ??= new MockImageProvider());
}

export function getUpscaler(): Upscaler {
  return (upscaler ??= new MockUpscaler());
}

export function getModeration(): ModerationProvider {
  return (moderation ??= new MockModerationProvider());
}

export function getPrintRouter(): PrintRouter {
  return (printRouter ??= new PrintRouter([new MockPrintProvider()] as PrintProvider[]));
}

/** For tests. */
export function resetProviders() {
  story = image = upscaler = moderation = null;
  printRouter = null;
}

export function activeProviderNames() {
  const c = getConfig();
  return {
    story: getStoryProvider().name,
    storyModel: getStoryProvider().name === "mock" ? "mock" : c.STORY_MODEL,
    image: getImageProvider().name,
    upscaler: getUpscaler().name,
    moderation: getModeration().name,
    print: "mock",
  };
}
