import { READING_LEVEL_RULES } from "../../schemas/book";
import { voiceFor } from "../../schemas/voices";
import type { Outline } from "../../schemas/story";
import type { StoryContext, ThemeDraftRequest } from "../story/types";
import { ART_STYLES } from "../../schemas/theme";
import { retryNote } from "./client";

/**
 * Prompt text for the Claude story adapter. Stories are made in steps, like a
 * real author and editor would: story spine -> whole manuscript -> editor
 * review -> revision -> art direction. The system prompts are stable across
 * calls so they can be prompt-cached.
 */
export const STORY_SYSTEM_PROMPT = `You write personalized picture books for young children. A parent gives you their child's details and a theme; you write a story where the child is the hero.

A picture book is a STORY, not a list of fun moments. Every book you write must pass these craft rules:

Cause and effect
- Each page happens BECAUSE of the page before it ("so...", "but...", "because..."), never just "and then...". If a page could be removed or moved without anyone noticing, it is not part of the story.
- There is a clear problem with a cause a child can understand, and the hero wants something specific because of it.
- If the plot depends on how something in this world works (a magic bell, a machine, a rule), say how it works BEFORE it matters, and never break that rule. If something obvious would solve the problem (pulling a bell's rope, asking a grown-up), explain why it can't, or let it be tried and fail for a stated reason.
- Rule of three: let the hero try, fail for a clear reason, learn, and try again. The final success uses something set up earlier in the story.
- The ending resolves the problem and echoes the opening.

Setups and sensible actions
- Every object, character and ability used later must appear earlier. Introduce supporting characters by name the first time they appear, and give each one something to do that matters.
- Actions must make everyday sense to a child: the right object for the moment (a tissue for a drippy nose, food for a rumbling tummy, a ladder to reach something high) and a reason a child can see for why each character does what they do.

Personal details
- Use the child's name naturally, not in every line, and their pronouns correctly.
- Pick the ONE or TWO favorite things that can matter to the plot and use them meaningfully. Do not list every favorite. Include the pet and best friend only when the options say to, and then give them a real part.
- If a lesson is given, show it through a choice the hero makes that changes what happens. Never state it as a slogan or moral.
- The theme's story beats are inspiration, not a checklist: use the ones that serve this story's chain of cause and effect.

Pictures follow the words
- Every page is one clear moment an illustrator can draw.
- When the world changes in a way you can see (everything upside down, nighttime, rain), it stays that way on every page until the story changes it back, and the words keep reminding the reader.

Safety and originality
- Age-appropriate vocabulary for the reading level. Cartoon peril only. Nothing frightening, violent, romantic, or unsafe. No weapons. Everything stays G-rated.
- Use only the theme's original characters plus the child, pet and friend. Never mention or allude to trademarked or copyrighted characters, franchises, brands, real authors or celebrities.
- Follow every content rule listed in the theme.`;

export const EDITOR_SYSTEM_PROMPT = `You are a demanding, kind picture-book editor. You read a draft the way a parent reading aloud and a five-year-old listener would experience it, and you find every place the story stops making sense.

Check, in order of importance:
1. Can a five-year-old retell it: what went wrong, why, what the hero did about it, and how it ended?
2. Does every page follow from the one before? Flag any page that could be cut or moved without anyone noticing, and any jump the reader can't follow.
3. Are the world's rules stated before they matter, and never broken? If an obvious action (pulling a rope, asking for help) would solve the problem, does the story explain why it doesn't?
4. Is every object, character and ability set up before it is used, and named when first seen?
5. Does every action make everyday sense (the right object for the moment, a visible reason for what each character does)?
6. Does the hero cause the solution, and do earlier attempts fail for clear reasons?
7. Is any lesson shown through a choice rather than preached? Is a refrain used at most three times, and kept free of the lesson?
8. Is the reading level and voice respected? Does rhyme ever force nonsense or filler words?
9. Can each page be drawn as one moment? Are lasting visual changes (an upside-down town, night) carried by the words on every page until they end? Are there contradictions (a hat on his head on one page and on his toes the next)?
10. Does the ending resolve the problem and echo the opening?

Return "pass" only when a parent would find nothing confusing. Otherwise return "revise" with the most important issues first (at most 8), each tied to a page number (0 for the whole book) with a concrete fix. Keep each problem and each fix to one or two short sentences (under 300 characters).`;

export const ART_SYSTEM_PROMPT = `You are the art director for a children's picture book. You turn a finished manuscript into precise picture instructions so that every illustration shows exactly what its words say, and the world stays consistent from page to page.

Rules for each page's scene:
- Describe one clear moment that matches the words on that page: the action, who is present (the hero by name; the illustrator has a character reference), the setting, the mood and the camera framing.
- mustShow: list every concrete thing the words say that a reader would look for in the picture, phrased exactly as the words describe it (for example "the Mayor upside down, balancing on his teapot hat", "Oliver handing the bigger half of his cheese to the Grumblesnoot"). Never contradict the words.
- continuity: the world state that must be visible on this page from the story's lasting changes and recurring props (for example "the whole town is upside down: houses hang from the ground above, trees grow downward; Oliver wears his green backpack").
- Characters look the same on every page; describe recurring characters the same way each time.
- Never ask for text, letters, words, signs, or labels to appear in the picture.

Page layouts:
- "fullBleed": the picture fills the page; text sits in a box over the picture at the textZone.
- "imageTop": picture on the top two thirds, text underneath (use textZone "bottom").
- "textSpot": a mostly text page with a small spot illustration (use textZone "bottom").
- "spread": one wide picture across two facing pages. Use at most two spreads, only for big moments, and only on odd page numbers (they start on a left-hand page). Use textZone "left" or "right".
- "textZone" is where the words go, so the picture must leave calm, uncluttered space there (for example open sky at the top, or a plain floor at the bottom).
- Vary layouts so the book has rhythm. Start with "fullBleed" on page 1. Pages with more words suit "imageTop" or "textSpot".`;

/** The reading-level rule, as adjusted by the book's voice. */
export function readingRule(ctx: StoryContext): string {
  const level = READING_LEVEL_RULES[ctx.options.readingLevel];
  const voice = voiceFor(ctx.options);
  return `${level.label}: ${voice.readingLevels?.[ctx.options.readingLevel] ?? level.rule}`;
}

/** The voice style guide, placed after the book details so it takes priority on tone. */
export function voiceBlock(ctx: StoryContext): string {
  const voice = voiceFor(ctx.options);
  return `STORY VOICE: ${voice.label}\n${voice.guide}\nThe voice changes how the story sounds, never the safety and story rules above.`;
}

export function describeContext(ctx: StoryContext): string {
  const { child, theme, options } = ctx;
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
      readingLevel: readingRule(ctx),
      lesson: options.lesson || child.lesson || null,
      extraInstructionsFromParent: options.instructions || null,
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function outlinePrompt(ctx: StoryContext, problems?: string[]): string {
  const n = ctx.options.length;
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    voiceBlock(ctx),
    "",
    `Plan the story spine before any words are written. The book has exactly ${n} story pages.`,
    "- title: short, includes the child's name or nickname, suits the voice. premise: one line.",
    "- worldRule: how the magic or situation in this world works, in one or two plain sentences, including why the obvious quick fix will not work.",
    "- problem: what goes wrong and WHY, in kid logic. goal: what the hero wants because of it.",
    "- attempts: two or three tries that fail, each with the clear reason it fails. turningPoint: the idea or choice that changes things (it must use something set up earlier). resolution: how the problem is solved by the hero.",
    "- lessonShown: the choice that shows the lesson (empty if there is no lesson). endingEcho: how the last page echoes the first.",
    "- setups: every object, character or ability the plot relies on, with the page where it is set up and the page where it pays off (set up first).",
    "- continuity: lasting visual facts the illustrator must keep (world changes, recurring props, who travels with the hero) with the page range they apply to. One short sentence per fact.",
    `- pages: exactly ${n} pages numbered 1 to ${n}. For each: the beat (a short label), a one or two sentence summary, causeFromPrevious (how it follows from the page before; empty only for page 1), the characters present, and visualState (what the world looks like on that page).`,
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

export function manuscriptPrompt(ctx: StoryContext, outline: Outline, problems?: string[]): string {
  const n = ctx.options.length;
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    "Here is the story spine to follow:",
    JSON.stringify(outline, null, 2),
    "",
    voiceBlock(ctx),
    "",
    `Write the whole story now, as one continuous manuscript split into exactly ${n} pages. Write only the words a reader will read aloud; no picture instructions.`,
    `- Respect the reading level exactly: ${readingRule(ctx)}`,
    "- The story comes first and the voice second: if a rhyme would force nonsense or a filler word, choose a near-rhyme or a plain line instead.",
    "- Make every page follow from the one before, state the world's rule before it matters, and set up everything before it is used, exactly as the spine plans.",
    "- Keep lasting visual changes in the words on every page until they end, so the pictures can show them.",
    ctx.options.dedication
      ? `- dedication: use exactly ${JSON.stringify(ctx.options.dedication)}`
      : "- dedication: a short, warm dedication from the parent to the child (one or two lines, in the voice).",
    "- backCoverBlurb: two or three sentences or a short verse, in the voice, no spoilers.",
    "Before answering, read the whole story aloud in your head from page 1 to the end and fix anything a child would not follow.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

function manuscriptText(pages: Array<{ pageNumber: number; text: string }>): string {
  return pages.map((p) => `Page ${p.pageNumber}:\n${p.text}`).join("\n\n");
}

export function editorPrompt(ctx: StoryContext, outline: Outline, pages: Array<{ pageNumber: number; text: string }>): string {
  return [
    `This is a draft picture book for a ${ctx.child.age}-year-old (${readingRule(ctx)}), in the "${voiceFor(ctx.options).label}" voice.`,
    "The author's plan:",
    JSON.stringify({ worldRule: outline.worldRule, problem: outline.problem, goal: outline.goal, attempts: outline.attempts, turningPoint: outline.turningPoint, resolution: outline.resolution, lessonShown: outline.lessonShown, setups: outline.setups, continuity: outline.continuity }, null, 2),
    "",
    "The draft:",
    manuscriptText(pages),
    "",
    "Review the draft against your checklist and return your verdict, a one or two sentence overall read, and the issues.",
  ].join("\n");
}

export function rewritePrompt(ctx: StoryContext, outline: Outline, pages: Array<{ pageNumber: number; text: string }>, issues: Array<{ page: number; problem: string; fix: string }>, problems?: string[]): string {
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    "The story spine:",
    JSON.stringify(outline, null, 2),
    "",
    voiceBlock(ctx),
    "",
    "Your draft:",
    manuscriptText(pages),
    "",
    "The editor found these problems:",
    issues.map((i) => `- ${i.page ? `Page ${i.page}` : "Whole book"}: ${i.problem} Fix: ${i.fix}`).join("\n"),
    "",
    `Rewrite the manuscript to fix every problem while keeping what already works. Keep exactly ${ctx.options.length} pages and the reading level (${readingRule(ctx)}). Change the plan where the editor's fixes need it, but keep the story's cause and effect intact from start to finish.`,
    ctx.options.dedication ? `Keep the dedication exactly: ${JSON.stringify(ctx.options.dedication)}` : "Keep or improve the dedication.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

export function artDirectionPrompt(ctx: StoryContext, outline: Outline, pages: Array<{ pageNumber: number; text: string }>, problems?: string[]): string {
  const cast = ctx.theme.supportingCast.map((c) => `${c.name} (${c.role}): ${c.look}`).join("\n");
  return [
    `Theme: ${ctx.theme.name}. Setting: ${ctx.theme.setting}. Mood: ${ctx.theme.artDirection.mood}.`,
    `The hero: ${ctx.child.nickname || ctx.child.firstName}, age ${ctx.child.age}.`,
    "Supporting characters as they must look:",
    cast,
    "",
    "Lasting visual facts from the story plan:",
    JSON.stringify(outline.continuity, null, 2),
    "",
    "The finished manuscript:",
    manuscriptText(pages),
    "",
    `For each of the ${ctx.options.length} pages, give the scene (action, characters, setting, mood, framing, mustShow, continuity), the layout and the textZone, following your rules.`,
    "Also write storySummary: the whole story in four to six plain sentences (beginning, problem, attempts, solution, ending) for the illustrator to read before every page.",
    "And a coverScene: the hero in a joyful pose in the setting that hints at the story without spoiling it, with open sky at the top for the title.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

export function revisePrompt(text: string, sceneAction: string | null, instruction: string, ctx: StoryContext): string {
  return [
    `Revise the text of one page in a picture book about ${ctx.child.nickname || ctx.child.firstName} (${ctx.child.pronouns}).`,
    `Reading level: ${readingRule(ctx)}`,
    voiceBlock(ctx),
    "Keep the page in this voice unless the parent's request asks for something different.",
    sceneAction ? `The picture on this page shows: ${sceneAction}` : "",
    `Current text: ${JSON.stringify(text)}`,
    `The parent's request: ${JSON.stringify(instruction)}`,
    "Keep the story consistent with the picture and the rest of the book. Return only the new page text.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const DESCRIBE_CHARACTER_PROMPT = `This image is a character sheet for the hero of a children's picture book. Describe the character's fixed visual traits so an illustrator can draw them identically on every page. Be specific and concrete (exact colors, lengths, shapes). Use "none" when a trait is absent.`;

export const THEME_SYSTEM_PROMPT = `You design themes for a personalized picture book app for children aged 2 to 8. A parent describes what their child loves; you design an original world for a story where the child is the hero.

Rules:
- Everything must be original: invent the setting, characters and names. Never use or imitate trademarked or copyrighted characters, franchises, brands, or real celebrities, and never describe a lookalike of one. If the parent mentions one, capture the genre (for example "superheroes" or "space adventure") with your own original world.
- Gentle, warm and G-rated: cartoon peril only, no weapons, nothing frightening.
- A supporting cast of 2 to 4 friendly characters, each with a short name, a role, and a vivid one-line visual description an illustrator can follow.
- 6 to 10 story beats that form a clear arc with a cozy ending.
- A palette of 4 hex colors that suit the mood, and a default art style from: ${ART_STYLES.join(", ")}.
- 2 to 5 content rules specific to this theme that keep it gentle.
- The id is a short lowercase slug with dashes.`;

export function themePrompt(req: ThemeDraftRequest, problems?: string[]): string {
  return [
    "The parent's description of what their child loves:",
    JSON.stringify(req.description),
    req.childAge ? `The child is ${req.childAge} years old; set ageRange around that age.` : "Set a sensible ageRange between 2 and 8.",
    "Design the theme.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}
