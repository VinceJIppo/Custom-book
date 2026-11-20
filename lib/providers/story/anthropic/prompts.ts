import { READING_LEVEL_RULES } from "../../../schemas/book";
import type { Outline } from "../../../schemas/story";
import type { StoryContext } from "../types";

/**
 * Prompt text for the Claude story adapter. The system prompt is stable across
 * calls so it can be prompt-cached once it grows past the cache minimum.
 */
export const STORY_SYSTEM_PROMPT = `You write personalized picture books for young children. A parent gives you their child's details and a theme; you write a story where the child is the hero.

Story rules:
- The child is the hero and solves the problem through their own choices and actions. Adults and sidekicks help, but never take over the solution.
- Use the child's name naturally, not in every line. Use the child's pronouns correctly.
- Weave in the child's favorite things (colors, animals, foods, activities) where they fit naturally. Include the pet and best friend only when the options say to.
- If a lesson is given, show it through what happens, gently, without a lecture.
- Age-appropriate vocabulary for the reading level. For the youngest readers, rhythm and repetition are welcome.
- Cartoon peril only. Nothing frightening, violent, romantic, or unsafe. No weapons. Everything stays G-rated.
- A clear arc and a warm, cozy ending.
- Use only the original characters provided by the theme plus the child, pet and friend. Never mention or allude to trademarked or copyrighted characters, franchises, brands, or real celebrities.
- Follow every content rule listed in the theme.

Illustration notes (the "scene" for each page) are instructions for an illustrator, not story text:
- Describe one clear moment: the action, who is present, the setting, the mood, and the camera framing.
- Refer to the child by name; the illustrator already has a character reference for the child.
- Never ask for text, letters, words, signs, or labels to appear in the picture.

Page layouts:
- "fullBleed": the picture fills the page; text sits in a box over the picture at the textZone.
- "imageTop": picture on the top two thirds, text underneath (use textZone "bottom").
- "textSpot": a mostly text page with a small spot illustration (use textZone "bottom").
- "spread": one wide picture across two facing pages. Use at most two spreads, only for big moments, and only on odd page numbers (they start on a left-hand page). Use textZone "left" or "right".
- "textZone" is where the words go, so the picture must leave calm, uncluttered space there (for example open sky at the top, or a plain floor at the bottom).
- Vary layouts so the book has rhythm. Start with "fullBleed" on page 1.`;

export function describeContext(ctx: StoryContext): string {
  const { child, theme, options } = ctx;
  const level = READING_LEVEL_RULES[options.readingLevel];
  const payload = {
    child: {
      name: child.firstName,
      nickname: child.nickname ?? null,
      age: child.age,
      pronouns: child.pronouns,
      favorites: child.favorites,
      pet: options.includePet && child.petName ? { name: child.petName, type: child.petType ?? "pet" } : null,
      bestFriend: options.includeFriend ? (child.friends[0] ?? null) : null,
    },
    theme: {
      name: theme.name,
      pitch: theme.pitch,
      setting: theme.setting,
      supportingCast: theme.supportingCast,
      storyBeats: theme.storyBeats,
      powerIdeas: theme.powerIdeas ?? null,
      mood: theme.artDirection.mood,
      contentRules: theme.contentRules,
    },
    options: {
      storyPages: options.length,
      readingLevel: `${level.label}: ${level.rule}`,
      lesson: options.lesson || child.lesson || null,
      extraInstructionsFromParent: options.instructions || null,
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function outlinePrompt(ctx: StoryContext, problems?: string[]): string {
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    `Write the outline: a title (short, includes the child's name or nickname), a one-line premise, and exactly ${ctx.options.length} pages numbered 1 to ${ctx.options.length}.`,
    "For each page give the story beat (drawn from the theme's storyBeats, in order, spread across the pages), a one or two sentence summary of what happens, and the characters on that page.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

export function pagesPrompt(ctx: StoryContext, outline: Outline, problems?: string[]): string {
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    "Here is the approved outline:",
    JSON.stringify(outline, null, 2),
    "",
    `Now write all ${ctx.options.length} story pages, following the outline page by page. For each page return the page text (respecting the reading level exactly), the illustration scene, the layout and the textZone.`,
    ctx.options.dedication
      ? `Use this dedication exactly: ${JSON.stringify(ctx.options.dedication)}`
      : "Also write a short, warm dedication from the parent to the child (one or two lines).",
    "Also write a back-cover blurb (two or three sentences, no spoilers) and a cover scene (the child in a heroic, joyful pose in the setting, with open sky at the top for the title).",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

export function revisePrompt(text: string, sceneAction: string | null, instruction: string, ctx: StoryContext): string {
  const level = READING_LEVEL_RULES[ctx.options.readingLevel];
  return [
    `Revise the text of one page in a picture book about ${ctx.child.nickname || ctx.child.firstName} (${ctx.child.pronouns}).`,
    `Reading level: ${level.label}: ${level.rule}`,
    sceneAction ? `The picture on this page shows: ${sceneAction}` : "",
    `Current text: ${JSON.stringify(text)}`,
    `The parent's request: ${JSON.stringify(instruction)}`,
    "Keep the story consistent with the picture and the rest of the book. Return only the new page text.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const DESCRIBE_CHARACTER_PROMPT = `This image is a character sheet for the hero of a children's picture book. Describe the character's fixed visual traits so an illustrator can draw them identically on every page. Be specific and concrete (exact colors, lengths, shapes). Use "none" when a trait is absent.`;

function retryNote(problems?: string[]) {
  if (!problems?.length) return "";
  return `\nYour previous answer had these problems. Fix all of them:\n- ${problems.join("\n- ")}`;
}
