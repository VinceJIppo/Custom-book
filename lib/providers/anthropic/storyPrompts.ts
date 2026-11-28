import { READING_LEVEL_RULES } from "../../schemas/book";
import { voiceFor } from "../../schemas/voices";
import { verseShape } from "../../schemas/storyText";
import type { BlindRead, Outline } from "../../schemas/story";
import { budgetText } from "../../books/budget";
import { audienceFor, audienceText } from "../../books/audience";
import type { ReadingLevel } from "../../schemas/book";
import type { StoryContext, ThemeDraftRequest } from "../story/types";
import { ART_STYLES, familyPartFor } from "../../schemas/theme";
import { retryNote } from "./client";
import { setupPageCount } from "../../books/setup";

/**
 * Prompt text for the Claude story adapter. Stories are made in steps, like a
 * real author and editor would: story spine -> whole manuscript -> editor
 * review -> revision -> art direction. The system prompts are stable across
 * calls so they can be prompt-cached.
 */
export const STORY_SYSTEM_PROMPT = `You write personalized picture books for young children. A parent gives you their child's details and a theme; you write a story where the child is the hero.

A picture book is a STORY, not a list of fun moments. Every book you write must pass these craft rules:

The opening (before the adventure)
- Never start in the middle of the action. The first pages show the hero at home in their everyday world: where they are, who they're with, and something they love or want, so the reader cares before anything goes wrong.
- Then a clear "One day..." moment disrupts that world, with a cause a child can follow.
- Before the hero sets off, the reader knows why it matters to THEM (what they'd lose, who is counting on them) and why they, not a grown-up, have to act. The hero chooses to go; they are not just swept along.
- When the spine has a setup plan, follow it for the opening pages: they introduce the hero's world, the disruption and the decision exactly as planned, and plant its details for later.

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

Real family and friends in the story
- When otherPeopleInTheStory is given, these are real people the child loves. Portray them warmly and respectfully and use the name the child calls them. Within the story budget, give them a real part that matters to the plot; anyone beyond the budget appears warmly in a cameo.
- Follow each person's theirPartInThisStory closely: it is the parent's wish for the book. A secret (for example "Mom is secretly a superhero and the child doesn't know") is a gift to the reader: keep it hidden from the child character until the moment the parent planned (or keep it a fun secret the reader shares), and plant small clues along the way.
- storyCentersOn says whose story it is. If it is a grown-up, the child still has an important, active part, and the story should help the child see that grown-up in a new, admiring light.
- whatThisStoryIsAbout comes first: build the plot around it and use the theme for the setting, supporting cast and mood. If it describes a real job or a real life situation (a hospital stay, a move, a new sibling), keep the facts true, simple and reassuring for the child's age.
- The child's family in this book is ONLY the child and the people in otherPeopleInTheStory. Never add, mention or picture a parent, brother, sister, grandparent or other relative who is not listed there, even if the theme or story idea suggests one. When family.ifNoGrownUp is given, follow it for any grown-up the story needs.

Characters stay the same from page to page
- Every character keeps the same species, size, colors, clothes and accessories (glasses, hats, bags, capes) on every page. An animal is always the same kind of animal: a red fox on page 2 is the same red fox on page 12, never a dog, a cat or a "furry friend" of another kind. Always call it by its name or its kind consistently.
- Nobody gains or loses glasses, a hat, an outfit or something they carry in the middle of the story unless a page shows it happening and why (finding a hat, taking off a coat at home). Characters out on an adventure cannot change clothes or fetch things from home.
- The real people's looks (heroAppearance and each person's appearance) come from their character sheets. Never contradict them in the words: if the hero has no glasses, never mention glasses on the hero; if they wear glasses, they wear them on every page.
- Do not introduce new physical details about a character late in the book. If a detail matters to the plot, set it up on the first page where that character appears.

Silly worlds still make sense
- A world can be upside down, magical or ridiculous, but inside it everything follows its own rules, and every character does things for a reason a child can see. Funny sounds and made-up words are fine; a made-up reason for the plot is not.
- Simple beats crowded: one problem, one goal, a few characters who each matter. If a character or detail doesn't change what happens, leave it out.

Pictures follow the words
- Every page is one clear moment an illustrator can draw.
- When the world changes in a way you can see (everything upside down, nighttime, rain), it stays that way on every page until the story changes it back, and the words keep reminding the reader.

Punctuation
- Never use long dashes (em dashes or en dashes) in anything a reader will see. Use a comma, a full stop, an exclamation mark or "..." instead.

Safety and originality
- Age-appropriate vocabulary for the reading level. Cartoon peril only. Nothing frightening, violent, romantic, or unsafe. No weapons. Everything stays G-rated.
- Use only the theme's original characters plus the child, pet and friend. Never mention or allude to trademarked or copyrighted characters, franchises, brands, real authors or celebrities.
- Follow every content rule listed in the theme.

What "makes sense" looks like (a short example in plain prose; never copy its plot, names or words):
Page 1: Every morning, Nell fed the ducks at the pond with her grandpa. The littlest duck, Dot, always waddled right up to her shoes.
Page 2: One morning, Dot wasn't there. "She's stuck on the island," said Grandpa. "The water's too deep for her little legs today."
Page 3: Grandpa's knee was sore, so he couldn't wade out. Nell looked at the island. "Then I'll find a way," she said.
Page 4: Nell tried throwing bread to the island, but the wind blew it back. Dot needed to come home, not just eat.
Page 5: Then Nell remembered the flat stones Grandpa had shown her, the ones that stayed dry even when the pond was high.
Page 6: She laid the stones one by one, a little path across the water. Dot peeped. She hopped from stone to stone.
Page 7: Dot waddled right up to Nell's shoes. Grandpa laughed. "You built her a bridge!"
Page 8: The next morning, the ducks were waiting, and so was the little stone path.
Why it works: we meet Nell's world and what she loves first; the problem has a reason (deep water); Grandpa can't help and says why; the first try fails for a clear reason; the solution uses something set up earlier (the stones); the ending echoes the opening.`;

export const EDITOR_SYSTEM_PROMPT = `You are a demanding, kind picture-book editor. You read a draft the way a parent reading aloud and a five-year-old listener would experience it, and you find every place the story stops making sense.

Check, in order of importance:
0. Does the opening set the story up? Before the adventure begins, a listener should know who the hero is and what their everyday world is like, what they love or want, what happened to disrupt it, why it matters to the hero personally, and why the hero (not a grown-up) chooses to go. A story that starts mid-adventure, or whose hero sets off with no reason the listener understands, is a "major" issue on the page where the setup is missing.
1. Can a five-year-old retell it: what went wrong, why, what the hero did about it, and how it ended?
2. Does every page follow from the one before? Flag any page that could be cut or moved without anyone noticing, and any jump the reader can't follow.
3. Are the world's rules stated before they matter, and never broken? If an obvious action (pulling a rope, asking for help) would solve the problem, does the story explain why it doesn't?
4. Is every object, character and ability set up before it is used, and named when first seen?
5. Does every action make everyday sense (the right object for the moment, a visible reason for what each character does)?
6. Does the hero cause the solution, and do earlier attempts fail for clear reasons?
7. Is any lesson shown through a choice rather than preached? Is a refrain used at most three times, and kept free of the lesson?
8. Is the reading level and voice respected? For verse, read every line aloud: flag lines that are too long, stumble off the beat, or rhyme by force (an odd word picked only because it rhymes, twisted word order, filler like "you see" or "big, big, BIG"). Quote the line.
9. Can each page be drawn as one moment? Are lasting visual changes (an upside-down town, night) carried by the words on every page until they end? Are there contradictions (a hat on his head on one page and on his toes the next)?
10. Do characters stay the same? Check every page against the character guide and appearances: flag any page where an animal changes kind or color, or where a character gains or loses glasses, a hat, an outfit or a carried item without the words showing it happen (no one can change clothes or put on glasses mid-adventure). Flag any physical detail about a character that first appears late in the book, or that contradicts their appearance.
11. Does the ending resolve the problem and echo the opening?

Mark each issue "major" when a child or parent would be confused or notice a contradiction (a plot hole, a broken rule, an unexplained jump, a character who changes), and "minor" when it is only wording, rhythm or polish.

Return "pass" only when a parent would find nothing confusing. Otherwise return "revise" with the most important issues first (at most 8), each tied to a page number (0 for the whole book) with a concrete fix. Keep each problem and each fix to one or two short sentences (under 300 characters).`;

export const ART_SYSTEM_PROMPT = `You are the art director for a children's picture book. You turn a finished manuscript into precise picture instructions so that every illustration shows exactly what its words say, and the world stays consistent from page to page.

Rules for each page's scene:
- Describe one clear moment that matches the words on that page: the action, who is present (the hero by name; the illustrator has a character reference), the setting, the mood and the camera framing.
- mustShow: list every concrete thing the words say that a reader would look for in the picture, phrased exactly as the words describe it (for example "the Mayor upside down, balancing on his teapot hat", "Oliver handing the bigger half of his cheese to the Grumblesnoot"). Never contradict the words.
- continuity: the world state that must be visible on this page from the story's lasting changes and recurring props (for example "the whole town is upside down: houses hang from the ground above, trees grow downward; Oliver wears his green backpack").
- Characters look the same on every page. Follow the character guide exactly: in each scene, describe every recurring character the same way each time, and always name an animal's kind and color with its name (for example "Pip, the small red fox"), so it can never be drawn as a different animal.
- In each scene's characters list, write every character as their name followed by their kind in brackets, exactly as the guide gives it, for example "Old Willa (a tall grey goose)" or "Pip (a small red fox)". Never describe a character as a different kind of animal anywhere in the scene.
- Nobody's clothes or accessories change between pages unless the words show it happening. Never add glasses, hats or other accessories the guide doesn't list, and never remove ones it does.
- Show an object or character only from the page whose words first bring it into the story. Before that page it must not appear in the action, mustShow, continuity or characters, even if the story plan says otherwise. Where the plan and the manuscript disagree, follow the manuscript.
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
  const shape = verseShape(ctx.options.voice, ctx.options.readingLevel);
  const limits = shape ? ` Every line has at most ${shape.maxWordsPerLine} words, with a steady beat; at most ${shape.maxLines} lines per page.` : "";
  return `${level.label}: ${voice.readingLevels?.[ctx.options.readingLevel] ?? level.rule}${limits}`;
}

/** The voice style guide, placed after the book details so it takes priority on tone. */
export function voiceBlock(ctx: StoryContext): string {
  const voice = voiceFor(ctx.options);
  return `STORY VOICE: ${voice.label}\n${voice.guide}\nThe voice changes how the story sounds, never the safety and story rules above.`;
}

/** Who the story centers on: the child, or one of the cast. */
export function spotlightName(ctx: StoryContext): string {
  const c = ctx.cast?.find((m) => m.id === ctx.options.spotlightId);
  return c ? c.nickname || c.name : ctx.child.nickname || ctx.child.firstName;
}

/** When the parent adds no grown-up: the story may still need one nearby, but never an invented parent. */
export const NO_GROWN_UP =
  "No grown-up from the family is in this book. If the story needs one nearby, call them only 'a grown-up' (never Mom, Dad or a named relative) and keep their face out of the pictures: hands, back, or a voice from a doorway.";

export function describeContext(ctx: StoryContext): string {
  const { child, theme, options } = ctx;
  const cast = ctx.cast ?? [];
  const payload = {
    child: {
      name: child.firstName,
      nickname: child.nickname ?? null,
      age: child.age,
      pronouns: child.pronouns,
      favorites: child.favorites,
      appearance: ctx.appearance?.hero ?? null,
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
    otherPeopleInTheStory: cast.length
      ? cast.map((m) => ({
          name: m.name,
          whatTheChildCallsThem: m.nickname ?? null,
          whoTheyAre: m.kind === "grownup" ? `${m.relationship ?? "a grown-up"} (a real grown-up in ${child.nickname || child.firstName}'s life)` : `a child${m.age ? ` aged ${m.age}` : ""}`,
          pronouns: m.pronouns,
          about: m.about ?? null,
          appearance: ctx.appearance?.people?.[m.nickname || m.name] ?? m.look ?? null,
          // The parent's own words win; otherwise the base story's part for a grown-up, a younger or an older child.
          theirPartInThisStory: m.part || familyPartFor(theme.familyParts, m, child.age) || null,
        }))
      : null,
    family: {
      onlyThesePeople: "The child and otherPeopleInTheStory are the whole family in this book. Never invent a parent, sibling or other relative.",
      ifNoGrownUp: cast.some((m) => m.kind === "grownup") ? null : (theme.familyParts?.withoutGrownUp ?? NO_GROWN_UP),
    },
    storyCentersOn: spotlightName(ctx),
    whatThisStoryIsAbout: options.storyAbout || null,
    // A rewrite: the parent read a previous draft and asked for these changes. Follow them closely.
    parentFeedbackOnPreviousDraft: options.storyFeedback
      ? { whatToChange: options.storyFeedback.note, previousTitle: options.storyFeedback.previousTitle ?? null, previousDraftSummary: options.storyFeedback.previousSummary ?? null }
      : null,
    options: {
      storyPages: options.length,
      readingLevel: readingRule(ctx),
      lesson: options.lesson || child.lesson || null,
      extraInstructionsFromParent: options.instructions || null,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** The theme's ready-made story idea the parent picked, if any. */
export function chosenStarter(ctx: StoryContext) {
  return ctx.options.starterId ? ctx.theme.starters?.find((s) => s.id === ctx.options.starterId) : undefined;
}

export function outlinePrompt(ctx: StoryContext, problems?: string[]): string {
  const n = ctx.options.length;
  const starter = chosenStarter(ctx);
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    voiceBlock(ctx),
    "",
    starter
      ? `The parent chose this story idea. Build the spine on it: keep its problem, the reason the first tries fail, and how the hero solves it, but tell it with this child as the hero and give the people in otherPeopleInTheStory parts within the story budget. Adapt names, details and the number of pages to this book.\nStory idea "${starter.title}": ${starter.idea}\n`
      : "",
    budgetText(n, ctx.options.readingLevel),
    audienceText(ctx.options.readingLevel),
    "",
    `Plan the story spine before any words are written. The book has exactly ${n} story pages.`,
    `- kidSummary: first, the whole story in ${audienceFor(ctx.options.readingLevel).summary} ${audienceFor(ctx.options.readingLevel).listener} could say back,`+" in order, using \"wants\", \"but\", \"because\" and \"so\" (for example: \"Nell loves feeding the ducks. But one day Dot is stuck on the island, because the water is too deep. Grandpa can't wade out. Nell throws bread, but the wind blows it back. So she builds a stone path, and Dot comes home.\"). If you can't say it this simply, the story is too complicated: simplify it before planning the pages.",
    "- title: short, includes the child's name or nickname, suits the voice, and has no commas or dashes. premise: one line.",
    "- worldRule: how the magic or situation in this world works, in one or two plain sentences, including why the obvious quick fix will not work.",
    "- problem: what goes wrong and WHY, in kid logic. goal: what the hero wants because of it.",
    "- attempts: two or three tries that fail, each with the clear reason it fails. turningPoint: the idea or choice that changes things (it must use something set up earlier). resolution: how the problem is solved by the hero.",
    "- lessonShown: the choice that shows the lesson (empty if there is no lesson). endingEcho: how the last page echoes the first.",
    "- setups: every object, character or ability the plot relies on, with the page where it is set up and the page where it pays off (set up first).",
    "- continuity: lasting visual facts the illustrator must keep (world changes, recurring props, who travels with the hero) with the page range they apply to. One short sentence per fact.",
    "- characters: EVERY character who appears on more than one page, including the hero, the pet, friends, the real people and the theme's characters. For each: name; species (exactly what kind of being, with color and size for animals, for example \"a small red fox\" or \"a fluffy white rabbit\", never just \"an animal\"); look (the colors, clothes and accessories they keep for the whole book, and what they do NOT wear, for example \"blue scarf, no glasses, no hat\"). Use the real people's appearance exactly as given. These never change during the story.",
    `- pages: exactly ${n} pages numbered 1 to ${n}. For each: the beat (a short label), a one or two sentence summary, causeFromPrevious (how it follows from the page before; empty only for page 1), the characters present, and visualState (what the world looks like on that page).`,
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

/** The setup agent: plans how the story begins so the journey has a reason. */
export const SETUP_SYSTEM_PROMPT = `You are a picture-book story consultant who specializes in openings. Parents have told us our stories jump into the adventure too fast: the reader doesn't know the hero yet, or why the hero sets off. Your job is to plan the opening pages so the journey has a clear, personal reason.

How great picture books begin:
- Meet the hero in their everyday world first: a specific place, a routine, the people or animals around them, and something they love or want. Concrete and visual, never a list of facts ("Every morning, Ava raced her paper boats down the garden stream" beats "Ava was five and liked boats").
- Then "One day..." something disrupts that world. Show its cause in kid logic.
- Make it personal: the problem touches what the hero loves or someone the hero cares about. Say why it matters to them.
- Give the hero, not a grown-up, the reason to act: the grown-ups can't, aren't there, or the hero has the one thing that helps. Rule out the easy fix in a sentence.
- The hero decides to go. A short line of dialogue or a brave choice is better than being swept along.
- Plant one or two small details in the opening (a skill, an object, a promise) that pay off later.
- Keep it brisk: each opening page is one clear moment an illustrator can draw. The opening sets up the story; it never stalls it.
- Keep the real people warm and true to what the parent wrote, the theme's world and characters, and the reading level. Characters keep the species and looks in the spine's character list.`;

export function setupPrompt(ctx: StoryContext, outline: Outline, problems?: string[]): string {
  const n = ctx.options.length;
  const k = setupPageCount(n);
  const { setup: _old, ...spine } = outline;
  void _old;
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    "Here is the story spine the writer will follow:",
    JSON.stringify(spine, null, 2),
    "",
    `The book has ${n} story pages. Plan the opening: pages 1 to ${k}. The adventure itself starts on page ${k + 1}, and from page ${k + 1} on the spine's pages stay as planned, so your page ${k} must lead straight into page ${k + 1}'s beat.`,
    "If the spine's first pages already jump into the adventure, move that action later in your plan's intent and give the reader the setup first. If those first pages hold an event the later pages rely on, keep it in your opening.",
    "- homeWorld: the hero's everyday world before anything goes wrong (place, routine, who is around).",
    "- heroWant: what the hero loves or wants, shown in the opening. innerNeed: what they grow in (tie it to the lesson if there is one; empty if none).",
    "- incitingIncident: the \"One day...\" event and its cause. whyItMatters: why it matters to this hero personally. whyTheHero: why the hero (not a grown-up) acts, and why the easy fix won't work.",
    "- decision: the moment the hero chooses to go.",
    `- journeyStartsOnPage: ${k + 1}.`,
    "- plants: one to three opening details that pay off later in the spine (name the later page if you can).",
    `- openingPages: exactly pages 1 to ${k}, with beat, summary, causeFromPrevious (empty for page 1), characters and visualState. Page 1 is the hero's everyday world (never the disruption).${k >= 4 ? " Spend the first two pages on the everyday world and the want." : ""} The disruption comes on page ${Math.max(2, k - 1)} at the latest, and page ${k} ends with the hero's decision.`,
    `- pages: EVERY page, 1 to ${n}, as the writer should follow them: pages 1 to ${k} exactly as in openingPages, then the rest of the spine's pages adjusted so they follow naturally from your opening (keep their events and order, fix any link that no longer fits, and drop anything the opening already covered). Each page needs causeFromPrevious except page 1.`,
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
    outline.kidSummary.length
      ? "- Every sentence of kidSummary must happen clearly in the words, on a page a listener can point to: a child who only hears the story (never sees the plan or the pictures) must be able to say it back. Say the reasons out loud in the words (\"because...\", \"so...\"); never leave them only in the plan."
      : "",
    budgetText(n, ctx.options.readingLevel),
    audienceText(ctx.options.readingLevel),
    "- The story comes first and the voice second: if a rhyme would force nonsense or a filler word, choose a near-rhyme or a plain line instead.",
    "- Make every page follow from the one before, state the world's rule before it matters, and set up everything before it is used, exactly as the spine plans.",
    outline.setup
      ? `- Pages 1 to ${outline.setup.journeyStartsOnPage - 1} are the opening, planned in setup: show the hero's everyday world and what they love, then the disruption, why it matters to them and their decision to go, before the adventure starts on page ${outline.setup.journeyStartsOnPage}. Plant setup.plants on those pages.`
      : "- Open on the hero's everyday world and what they love before anything goes wrong; make clear why they set off before the adventure begins.",
    "- Keep lasting visual changes in the words on every page until they end, so the pictures can show them.",
    "- Keep every character exactly as the spine's characters list describes them: same kind of animal, same colors, same clothes and accessories on every page. Never mention a feature (like glasses or a hat) a character doesn't have.",
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

/** The editor, judging for the book's own listener (a three-, five- or seven-year-old). */
export function editorSystemPrompt(level: ReadingLevel): string {
  return EDITOR_SYSTEM_PROMPT.replaceAll("a five-year-old", audienceFor(level).listener);
}

/** The blind reader, listening as the grown-up of the book's own listener. */
export function blindReaderSystemPrompt(level: ReadingLevel): string {
  const who = audienceFor(level).listener.replace(/^a /, "");
  return BLIND_READER_SYSTEM_PROMPT.replace("a bright five-year-old's grown-up", `a bright ${who}'s grown-up`);
}

/** The blind reader: hears only the words, never the plan, and retells the story. */
export const BLIND_READER_SYSTEM_PROMPT = `You are a bright five-year-old's grown-up, listening to a picture book read aloud for the very first time. You have NOT seen any plan, pictures or notes: only the words below. Retell the story honestly, exactly as you understood it from the words, then list every moment where a child listening would be lost.

Be strict and literal:
- If a reason is never said in the words, you don't know it. Write "not said" rather than guessing.
- If a character appears without being introduced, or does something for no reason you can see, that is confusing.
- If something is used (an object, an ability, a rule) that was never mentioned before, that is confusing.
- If a page doesn't follow from the one before, ask what you'd ask out loud ("Wait, where did the boat come from?").
Keep each answer short and plain.`;

export function blindReadPrompt(ctx: StoryContext, pages: Array<{ pageNumber: number; text: string }>): string {
  return [
    `A picture book for a ${ctx.child.age}-year-old, read aloud. The words, page by page:`,
    "",
    manuscriptText(pages),
    "",
    "Retell it: whatTheHeroWanted, whatWentWrong, whyItWentWrong, the tries that didn't work and why, howItWasSolved and howItEnded, each in one short sentence (\"not said\" when the words never say). Then confusing: every moment a listening child would be lost, with the page (0 for the whole book) and the question they'd ask. An empty list only if nothing at all is unclear.",
  ].join("\n");
}

/** The retelling as plain text, for the editor and the story lab. */
export function retellingText(r: BlindRead): string {
  const tries = r.tries.map((t) => `${t.what} (failed: ${t.whyItFailed || "not said"})`).join("; ");
  return [
    `Wanted: ${r.whatTheHeroWanted}`,
    `What went wrong: ${r.whatWentWrong} Why: ${r.whyItWentWrong}`,
    tries ? `Tries: ${tries}` : "Tries: none",
    `Solved: ${r.howItWasSolved}`,
    `Ending: ${r.howItEnded}`,
    r.confusing.length ? `Confusing: ${r.confusing.map((c) => `${c.page ? `page ${c.page}` : "book"}: ${c.question}`).join(" | ")}` : "Confusing: nothing",
  ].join("\n");
}

/** Writes the whole manuscript again after serious problems, so fixes don't leave seams between pages. */
export function fullRewritePrompt(
  ctx: StoryContext,
  outline: Outline,
  pages: Array<{ pageNumber: number; text: string }>,
  issues: Array<{ page: number; problem: string; fix: string }>,
  problems?: string[],
): string {
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
    "The editor and a first-time listener found these problems:",
    issues.map((i) => `- ${i.page ? `Page ${i.page}` : "Whole book"}: ${i.problem} Fix: ${i.fix}`).join("\n"),
    "",
    `Write the whole story again, all ${ctx.options.length} pages, fixing every problem. Keep what already works (good lines, the voice, the ending), but make the story flow as one piece from page 1 to the end: every page follows from the one before, every reason is said in the words, and every sentence of kidSummary happens on a page.`,
    `- Respect the reading level exactly: ${readingRule(ctx)}`,
    budgetText(ctx.options.length, ctx.options.readingLevel),
    audienceText(ctx.options.readingLevel),
    ctx.options.dedication ? `- dedication: use exactly ${JSON.stringify(ctx.options.dedication)}` : "- dedication: keep the current one unless it no longer fits.",
    "- backCoverBlurb: keep the current one unless the story changed.",
    "Before answering, read it aloud in your head as if you had never seen the plan, and fix anything a child would not follow.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Turns a finished prose story into verse in the book's voice, keeping every plot fact. */
export function versifyPrompt(ctx: StoryContext, outline: Outline, pages: Array<{ pageNumber: number; text: string }>, problems?: string[]): string {
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    voiceBlock(ctx),
    "",
    "Here is the finished story in plain prose. Its logic has been checked: a child can follow it.",
    manuscriptText(pages),
    "",
    "The story in a few sentences (every one must still come through):",
    outline.kidSummary.map((s) => `- ${s}`).join("\n") || "(see the story above)",
    "",
    `Now turn it into verse in the voice above, page for page (exactly ${ctx.options.length} pages, same page breaks).`,
    "- Keep every event, every reason (\"because\", \"so\", \"but\") and every character introduction. The rhyme serves the story: if a rhyme would change what happens, drop a fact or add a reason that isn't there, use a near-rhyme or a plain line instead.",
    "- No filler words picked for the sound, no twisted word order, no new characters, objects or events.",
    `- Respect the reading level: ${readingRule(ctx)}`,
    "- Return an empty dedication and backCoverBlurb to keep the current ones, or a short verse version of the blurb.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

function manuscriptText(pages: Array<{ pageNumber: number; text: string }>): string {
  return pages.map((p) => `Page ${p.pageNumber}:\n${p.text}`).join("\n\n");
}

export function editorPrompt(ctx: StoryContext, outline: Outline, pages: Array<{ pageNumber: number; text: string }>, blind?: BlindRead): string {
  return [
    `This is a draft picture book for a ${ctx.child.age}-year-old (${readingRule(ctx)}), in the "${voiceFor(ctx.options).label}" voice.`,
    audienceText(ctx.options.readingLevel),
    "Flag as an issue any page or plot choice that doesn't fit that listener (too complicated, too babyish, too long or too scary for this age).",
    "The author's plan:",
    JSON.stringify({ kidSummary: outline.kidSummary, setup: outline.setup ? { homeWorld: outline.setup.homeWorld, heroWant: outline.setup.heroWant, incitingIncident: outline.setup.incitingIncident, whyItMatters: outline.setup.whyItMatters, whyTheHero: outline.setup.whyTheHero, decision: outline.setup.decision } : undefined, worldRule: outline.worldRule, problem: outline.problem, goal: outline.goal, attempts: outline.attempts, turningPoint: outline.turningPoint, resolution: outline.resolution, lessonShown: outline.lessonShown, setups: outline.setups, continuity: outline.continuity, characters: outline.characters }, null, 2),
    ctx.appearance?.hero ? `How ${ctx.child.nickname || ctx.child.firstName} looks (from the character sheet; the words must never contradict it): ${ctx.appearance.hero}` : "",
    "",
    "The draft:",
    manuscriptText(pages),
    "",
    blind
      ? [
          "",
          "A reader who has NEVER seen the plan heard the draft read aloud and retold it like this:",
          retellingText(blind),
          "",
          "You know the plan, so you will fill gaps the listener can't: trust the listener. Compare their retelling with kidSummary and the plan. Every part of kidSummary they missed or got wrong, every reason they say is \"not said\", and every confusing moment they list is a \"major\" issue on the page where the words need to say more (unless their question is answered plainly in the words and they simply misread it).",
          "retellingMatch: 0 to 1, how much of kidSummary came through in their retelling (1 = all of it, clearly).",
        ].join("\n")
      : "retellingMatch: 1 if a child would retell kidSummary from the words alone, lower if not.",
    "Review the draft against your checklist and return your verdict, a one or two sentence overall read, retellingMatch, and the issues.",
  ].filter(Boolean).join("\n");
}

/**
 * Asks for only the pages that need to change. "rewrite" answers the first
 * editor review (may touch many pages); "polish" answers the last review and
 * changes as little as possible.
 */
export function rewritePrompt(
  ctx: StoryContext,
  outline: Outline,
  pages: Array<{ pageNumber: number; text: string }>,
  issues: Array<{ page: number; problem: string; fix: string }>,
  problems?: string[],
  mode: "rewrite" | "polish" = "rewrite",
): string {
  return [
    "Here are the details for this book:",
    describeContext(ctx),
    "",
    "The story spine:",
    JSON.stringify(outline, null, 2),
    "",
    voiceBlock(ctx),
    "",
    "Your current manuscript:",
    manuscriptText(pages),
    "",
    mode === "polish" ? "The editor's final notes:" : "The editor found these problems:",
    issues.map((i) => `- ${i.page ? `Page ${i.page}` : "Whole book"}: ${i.problem} Fix: ${i.fix}`).join("\n"),
    "",
    mode === "polish"
      ? "This is the final polish. Fix every note while changing as little as possible: keep every page that works exactly as it is."
      : "Fix every problem while keeping what already works. Change the plan where the editor's fixes need it, but keep the story's cause and effect intact from start to finish.",
    `Return ONLY the pages you change, each with its complete new text (pages you leave out stay as they are). The book keeps exactly ${ctx.options.length} pages and the reading level (${readingRule(ctx)}).`,
    "Make sure the pages you change still fit the pages around them.",
    ctx.options.dedication
      ? "Return an empty dedication (the parent wrote it), and an empty backCoverBlurb unless the fixes need a new one."
      : "Return an empty dedication and backCoverBlurb to keep the current ones, or new text if the fixes need it.",
    retryNote(problems),
  ]
    .filter(Boolean)
    .join("\n");
}

export function artDirectionPrompt(ctx: StoryContext, outline: Outline, pages: Array<{ pageNumber: number; text: string }>, problems?: string[]): string {
  const cast = [
    ...(ctx.cast ?? []).map((m) => `${m.nickname || m.name} (${m.kind === "grownup" ? (m.relationship ?? "grown-up") : "child"}, a real person): ${m.look ?? "drawn from their character reference sheet"}`),
    ...ctx.theme.supportingCast.map((c) => `${c.name} (${c.role}): ${c.look}`),
  ].join("\n");
  return [
    `Theme: ${ctx.theme.name}. Setting: ${ctx.theme.setting}. Mood: ${ctx.theme.artDirection.mood}.`,
    `The hero: ${ctx.child.nickname || ctx.child.firstName}, age ${ctx.child.age}.`,
    "Characters as they must look (name real people in each scene's characters exactly as written here, so the illustrator can match their reference sheets):",
    cast,
    "Only the people listed here are real family. Never add a parent, brother, sister or other relative to a scene. A grown-up who is not listed above (the words say only \"a grown-up\") is shown only partly: hands, back or from behind, never a clear face.",
    ctx.appearance?.hero ? `${ctx.child.nickname || ctx.child.firstName} (the hero): ${ctx.appearance.hero}` : "",
    "",
    "Character guide for the whole book (species and fixed look; use it in every scene):",
    JSON.stringify(outline.characters, null, 2),
    "",
    "Lasting visual facts from the story plan:",
    JSON.stringify(outline.continuity, null, 2),
    "",
    "The finished manuscript:",
    manuscriptText(pages),
    "",
    `For each of the ${ctx.options.length} pages, give the scene (action, characters, setting, mood, framing, mustShow, continuity), the layout and the textZone, following your rules.`,
    "Also list props: every recurring object and supporting character in the story, each by the shortest name the words use for it (for example \"Gizmo\", \"Boing-barrow\", \"Grumblesnoot\"). The app checks that none of them appears in a picture before the words introduce it.",
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
