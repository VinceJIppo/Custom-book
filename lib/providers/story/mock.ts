import type { ArtDirection, ArtInputPage, ManuscriptOptions, ManuscriptResult, StoryContext, StoryProvider, ThemeDraftRequest } from "./types";
import type { ThemeConfig } from "../../schemas/theme";
import type { CharacterBible, Outline, Scene, StoryLayout, StoryPage, StoryPagesResult, StorySetup, TextZone } from "../../schemas/story";
import { setupPageCount } from "../../books/setup";
import { READING_LEVEL_RULES } from "../../schemas/book";
import { voiceFor } from "../../schemas/voices";
import type { ImageData, WithUsage } from "../types";

/**
 * Deterministic, offline story writer. It follows a fixed eight-stage arc and
 * fills it with the child's details and the theme's cast and setting, so the
 * whole app works end to end with no API key.
 */

type Stage = "opening" | "call" | "journey" | "setback" | "idea" | "teamwork" | "triumph" | "cozy";
const STAGES: Stage[] = ["opening", "call", "journey", "setback", "idea", "teamwork", "triumph", "cozy"];

interface Vars {
  name: string;
  setting: string;
  leader: string;
  helper: string;
  sidekick: string;
  color: string;
  animal: string;
  food: string;
  activity: string;
  companion: string | null; // "Biscuit the puppy"
  companionShort: string | null; // "Biscuit"
  friend: string | null;
  obj: string; // him/her/them
  poss: string; // his/her/their
  lessonLine: string | null;
  power: string;
}

interface Template {
  s: [string, string, string, string];
  action: string;
  mood: string;
  framing: string;
  who: (v: Vars) => string[];
}

const t = (s: Template["s"], action: string, mood: string, framing: string, who: Template["who"]): Template => ({
  s,
  action,
  mood,
  framing,
  who,
});

function withCompanion(v: Vars, base: string[]) {
  const out = [...base];
  if (v.companionShort) out.push(v.companionShort);
  if (v.friend) out.push(v.friend);
  return out;
}

const TEMPLATES: Record<Stage, Template[]> = {
  opening: [
    t(
      [
        "Good morning, {name}! The sun was shining over {setting}.",
        "{name} stretched, wiggled {poss} toes, and looked out at the {color} sky.",
        "It smelled like {food} for breakfast, which was the best kind of morning.",
        "Something told {name} that today would not be an ordinary day.",
      ],
      "{name} wakes up and stretches by a sunny window that looks out over {setting}",
      "cozy and bright",
      "wide shot of a cheerful bedroom",
      (v) => withCompanion(v, [v.name]),
    ),
    t(
      [
        "{name} loved {activity} more than almost anything.",
        "{companionLine}",
        "Together they practiced until their cheeks were pink from smiling.",
        "Little did {name} know that {activity} was about to matter a lot.",
      ],
      "{name} happily {activity} in the yard",
      "playful",
      "medium shot, eye level",
      (v) => withCompanion(v, [v.name]),
    ),
  ],
  call: [
    t(
      [
        "Then {leader} came rushing in. \"We need your help!\"",
        "{leader} explained that something important had gone missing in {setting}.",
        "\"Only someone brave and kind can fix it,\" said {leader}.",
        "{name} took a deep breath and said, \"I'll help!\"",
      ],
      "{leader} arrives in a hurry and asks {name} for help",
      "surprised and excited",
      "medium shot, two characters facing each other",
      (v) => withCompanion(v, [v.name, v.leader]),
    ),
    t(
      [
        "{helper} showed {obj} a glowing map of {setting}.",
        "There was a long path, a big hill, and a blinking spot at the very end.",
        "\"That is where we must go,\" said {helper} softly.",
        "{name} traced the path with one finger and nodded.",
      ],
      "{helper} shows {name} a glowing map",
      "curious",
      "close-up over the shoulder at the map",
      (v) => [v.name, v.helper],
    ),
  ],
  journey: [
    t(
      [
        "Off they went across {setting}!",
        "{sidekick} led the way, bouncing ahead and calling, \"This way!\"",
        "They passed {color} flowers and waved to everyone they met.",
        "{name} felt a little nervous, but mostly excited.",
      ],
      "{name} and {sidekick} set off on their journey across {setting}",
      "adventurous",
      "wide landscape shot with the path ahead",
      (v) => withCompanion(v, [v.name, v.sidekick]),
    ),
    t(
      [
        "Along the way, they spotted {aFriendlyAnimal}.",
        "The {animal} wanted to come along too, so now the team was even bigger.",
        "{name} shared a snack of {food}, and everyone agreed it was delicious.",
        "\"Every adventure is better with friends,\" said {sidekick}.",
      ],
      "{name} meets {aFriendlyAnimal} and shares a snack",
      "warm and funny",
      "medium shot, characters sitting together",
      (v) => withCompanion(v, [v.name, v.sidekick]),
    ),
  ],
  setback: [
    t(
      [
        "Uh-oh! The path ended at a wobbly, tricky spot.",
        "{name} tried once, but it did not work. Splat!",
        "{name} sat down and frowned. Maybe this was too hard.",
        "{sidekick} sat down too and said, \"Everybody needs a second try.\"",
      ],
      "{name}'s first attempt does not work and {name} sits down, a little disappointed",
      "gentle, a little glum",
      "medium shot, slightly low angle",
      (v) => withCompanion(v, [v.name, v.sidekick]),
    ),
    t(
      [
        "The wind whooshed and the map blew away!",
        "Everyone gasped. Without the map, which way should they go?",
        "{helper} looked worried. {sidekick} looked worried too.",
        "But {name} closed {poss} eyes and tried to think.",
      ],
      "a gust of wind blows the map away while the team watches in surprise",
      "cartoon surprise, never scary",
      "wide shot with the map fluttering away",
      (v) => [v.name, v.helper, v.sidekick],
    ),
  ],
  idea: [
    t(
      [
        "Then {name} had an idea!",
        "{name} remembered how much {activity} helped whenever things felt tricky.",
        "{lessonLine}",
        "And suddenly, something amazing happened: {power}",
      ],
      "{name} has a bright idea and discovers {poss} special talent",
      "magical, triumphant",
      "close-up on {name}'s face lighting up",
      (v) => [v.name],
    ),
    t(
      [
        "\"I know what to do,\" said {name}.",
        "\"We can do it together, one step at a time.\"",
        "{leader} grinned. \"That is exactly what a hero would say.\"",
        "Everyone leaned in close to hear the plan.",
      ],
      "{name} explains a plan while the team huddles around",
      "hopeful",
      "medium shot, team in a circle",
      (v) => withCompanion(v, [v.name, v.leader, v.helper]),
    ),
  ],
  teamwork: [
    t(
      [
        "{name} led the way, and the whole team helped.",
        "{companionHelpLine}",
        "{helper} held things steady while {sidekick} cheered.",
        "Step by step, it started to work!",
      ],
      "the whole team works together, led by {name}",
      "energetic, joyful",
      "wide action shot",
      (v) => withCompanion(v, [v.name, v.helper, v.sidekick]),
    ),
    t(
      [
        "\"Almost there!\" called {leader}.",
        "{name} reached out as far as {poss} arms could stretch.",
        "Everyone held their breath.",
        "Then, with one more try, {name} did it!",
      ],
      "{name} reaches out for the final step while everyone watches",
      "suspenseful but safe",
      "dynamic angle, close on {name}'s hands",
      (v) => [v.name, v.leader],
    ),
  ],
  triumph: [
    t(
      [
        "Hooray! Everything in {setting} was fixed!",
        "The whole town cheered for {name}.",
        "{leader} gave {obj} a shiny {color} badge.",
        "\"You were brave, and you were kind,\" said {leader}. \"That is the best kind of hero.\"",
      ],
      "{setting} celebrates {name} with cheering and confetti",
      "jubilant",
      "wide shot of a big celebration",
      (v) => withCompanion(v, [v.name, v.leader, v.helper, v.sidekick]),
    ),
    t(
      [
        "There was a party with music, dancing, and lots of {food}.",
        "{name} danced with {sidekick} until everyone was giggling.",
        "{helper} said it was the best day {setting} had ever had.",
        "{name} thought so too.",
      ],
      "a celebration party with dancing and {food}",
      "joyful",
      "wide festive shot",
      (v) => withCompanion(v, [v.name, v.sidekick, v.helper]),
    ),
  ],
  cozy: [
    t(
      [
        "That night, {name} snuggled into bed, tired and happy.",
        "{companionNightLine}",
        "{name} held the {color} badge and smiled in the dark.",
        "Tomorrow might bring a brand-new adventure. Goodnight, {name}.",
      ],
      "{name} snuggles into bed holding a {color} badge, moonlight in the window",
      "calm, sleepy, warm",
      "soft close shot of the bed",
      (v) => withCompanion(v, [v.name]),
    ),
  ],
};

/** Rhyming couplets for the "rhyming-mischief" voice. Rhyme words are fixed at line ends so substitutions never break a rhyme. */
type Couplet = [string, string];
const RHYMES: Record<Stage, Array<[Couplet, Couplet]>> = {
  opening: [
    [
      ["Good morning, good morning! The sun's in the sky,", "and {name} hopped out of bed with a whoop and a \"Hi!\""],
      ["Now listen, dear reader, I'll whisper it low:", "today was the wibbliest day you could know."],
    ],
    [
      ["{name} loved {activity} from morning till night,", "and practiced and practiced with all of {poss} might."],
      ["{companionWith}, it was such a delight,", "though the neighbors all grumbled, \"Oh, not the whole night!\""],
    ],
  ],
  call: [
    [
      ["Then {leader} came zooming, all flustered and red:", "\"Come quick! Something's missing!\" is what {leader} said."],
      ["\"It's gone from {setting}! It's vanished! It's lost!", "We need someone clever, whatever the cost!\""],
    ],
    [
      ["{helper} unrolled a big map on the floor,", "with squiggles and wiggles and doodles galore."],
      ["\"We follow this path to the end of the line.\"", "{name} gave a nod. \"Then I'll make it all fine!\""],
    ],
  ],
  journey: [
    [
      ["So off they all went with a skip and a hop,", "past puddles and poodles. They didn't once stop!"],
      ["{sidekick} raced ahead, shouting, \"Hurry! This way!\"", "It was turning into a most whizzle-bang day."],
    ],
    [
      ["Along came {aAnimal}, as friendly as pie,", "who nibbled some {food} and let out a sigh."],
      ["\"Delicious!\" it squeaked with a wiggle and grin.", "\"Wherever you're going, I'd love to come in!\""],
    ],
  ],
  setback: [
    [
      ["But then (oh, dear reader!) the path gave a WOBBLE,", "and down tumbled {name} with a SPLISH and a SPLOBBLE."],
      ["{name} sat in the mud, looking terribly glum,", "while the frogs in the reeds hummed a sorry ho-hum."],
    ],
    [
      ["A wind came a-whirling, a-whistling, WHOOSH!", "and the map flew away to the top of a bush."],
      ["\"Oh no!\" cried {helper}. \"Now which way is right?\"", "But {name} just grinned. \"I've a plan. Hold on tight!\""],
    ],
  ],
  idea: [
    [
      ["Then {name} had a thought that went PING! in {poss} head,", "as bright as a lantern, as warm as fresh bread."],
      ["\"When things go all wonky, you try a new way,", "and that's how a hero can rescue the day!\""],
    ],
    [
      ["\"I know what to do!\" {name} said with a cheer.", "\"Now everyone, everyone, gather round here!\""],
      ["They huddled, they muddled, they whispered, they planned,", "and the plan was the cleverest plan in the land."],
    ],
  ],
  teamwork: [
    [
      ["So {name} led the way and the whole crew pitched in,", "with a heave and a ho and a big jolly grin."],
      ["{companionHelpWho} pulled and {helper} pushed with a groan,", "while {sidekick} sang loudly (and quite out of tone)."],
    ],
    [
      ["\"Almost!\" called {leader}. \"Now reach, reach up high!\"", "So {name} stretched up to the edge of the sky."],
      ["And then, with a PLINK and a PLONK and a PLOP,", "the very last piece clicked right into the top!"],
    ],
  ],
  triumph: [
    [
      ["Hooray and hooray! It was fixed! It was done!", "The whole of {setting} went wild with fun."],
      ["They pinned a bright {color} badge on {name}'s chest,", "and cried, \"You're the bravest, the kindest, the best!\""],
    ],
    [
      ["There was dancing and prancing and {food} piled high,", "and a cake with a candle that reached to the sky."],
      ["{name} danced with {sidekick} until they both flopped,", "and the music went on and the giggles never stopped."],
    ],
  ],
  cozy: [
    [
      ["That night {name} snuggled up, cozy and deep,", "with a yawn and a stretch and a sigh into sleep."],
      ["The moon, who'd been watching, said softly, \"Well done.", "Goodnight, little hero. Tomorrow: more fun!\""],
    ],
  ],
};

const LESSON_LINES: Record<string, string> = {
  bravery: "Being brave does not mean you are never scared. It means you try anyway.",
  sharing: "{name} remembered that sharing makes a good thing even bigger.",
  "first day of school": "{name} remembered that new places feel less scary once you find a friend.",
  "new sibling": "{name} remembered that big hearts always have room for one more.",
  bedtime: "{name} remembered that even heroes need rest to be their best.",
  "trying new foods": "{name} remembered that trying something new can be a delicious surprise.",
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildVars(ctx: StoryContext): Vars {
  const { child, theme, options } = ctx;
  const name = child.nickname || child.firstName;
  const cast = theme.supportingCast;
  const companionShort = options.includePet && child.petName ? child.petName : null;
  const companion = companionShort ? `${child.petName}${child.petType ? ` the ${child.petType}` : ""}` : null;
  const pron = { he: ["him", "his"], she: ["her", "her"], they: ["them", "their"] }[child.pronouns];
  const lesson = options.lesson || child.lesson || null;
  const activity = child.favorites.activities[0] ?? "singing";
  return {
    name,
    setting: theme.setting.split(",")[0].trim(),
    leader: cast[0].name,
    helper: (cast[1] ?? cast[0]).name,
    sidekick: (cast[2] ?? cast[1] ?? cast[0]).name,
    color: child.favorites.colors[0]?.toLowerCase() ?? "golden",
    animal: singular(child.favorites.animals[0]?.toLowerCase() ?? "bunny"),
    food: child.favorites.foods[0]?.toLowerCase() ?? "pancakes",
    activity: activity.toLowerCase(),
    companion,
    companionShort,
    friend: options.includeFriend ? (child.friends[0] ?? null) : null,
    obj: pron[0],
    poss: pron[1],
    lessonLine: lesson ? (LESSON_LINES[lesson.toLowerCase()] ?? `{name} remembered something important about ${lesson.toLowerCase()}.`) : null,
    power: `a glow of ${child.favorites.colors[0]?.toLowerCase() ?? "golden"} light sparkled all around, and ${activity.toLowerCase()} became ${name}'s superpower!`,
  };
}

/** "otters" -> "otter", "puppies" -> "puppy"; leaves "glass" and "fish" alone. */
function singular(word: string): string {
  if (/ies$/.test(word) && word.length > 4) return word.replace(/ies$/, "y");
  if (/(ches|shes|xes)$/.test(word)) return word.replace(/es$/, "");
  if (/[^s]s$/.test(word) && !/(us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;
}

/** Fill placeholders. Verse lines keep their own capitalization (capitalize=false). */
function fill(s: string, v: Vars, capitalize = true): string {
  const extra: Record<string, string> = {
    companionLine: v.companion ? `${v.companion} always joined in, wagging and bouncing.` : "Sometimes the birds joined in too.",
    companionHelpLine: v.companionShort
      ? `${v.companionShort} helped too${v.friend ? `, and so did ${v.friend}` : ""}.`
      : v.friend
        ? `${v.friend} helped too.`
        : "Even the birds helped.",
    companionNightLine: v.companionShort ? `${v.companionShort} curled up at the foot of the bed.` : "The stars twinkled outside the window.",
    lessonLine: v.lessonLine ?? "{name} remembered that the best ideas come from a calm, kind heart.",
    companionWith: v.companionShort ? `With ${v.companionShort} beside` : "With birds all around",
    aAnimal: withArticle(v.animal),
    aFriendlyAnimal: withArticle(`friendly ${v.animal}`),
    companionHelpWho: v.companionShort ?? (v.friend ?? "The birds"),
  };
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/\{(\w+)\}/g, (m, k: string) => {
      if (k in extra) return extra[k];
      const val = (v as unknown as Record<string, unknown>)[k];
      return typeof val === "string" ? val : m;
    });
  }
  return capitalize ? out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()) : out;
}

function stageFor(i: number, n: number): Stage {
  return STAGES[Math.min(STAGES.length - 1, Math.floor((i * STAGES.length) / n))];
}

function layoutFor(storyNumber: number, n: number, stage: Stage, spreadUsed: boolean): { layout: StoryLayout; textZone: TextZone } {
  // Story page k sits on physical page 3 + k, so odd k lands on a left-hand page,
  // which is where a spread must start.
  if (!spreadUsed && stage === "triumph" && storyNumber % 2 === 1 && storyNumber < n) return { layout: "spread", textZone: "left" };
  const cycle: Array<{ layout: StoryLayout; textZone: TextZone }> = [
    { layout: "fullBleed", textZone: "bottom" },
    { layout: "imageTop", textZone: "bottom" },
    { layout: "fullBleed", textZone: "top" },
    { layout: "textSpot", textZone: "bottom" },
  ];
  return cycle[(storyNumber - 1) % cycle.length];
}

function mockUsage(): WithUsage<never>["usage"] {
  return { provider: "mock", model: "mock-story", inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export class MockStoryProvider implements StoryProvider {
  readonly name = "mock";

  /** Offline setup plan: the template's first pages, labelled as the opening. */
  async planSetup(outline: Outline, ctx: StoryContext): Promise<WithUsage<StorySetup>> {
    const v = buildVars(ctx);
    const k = setupPageCount(ctx.options.length);
    const openingPages = outline.pages.slice(0, k).map((p, i) => ({ ...p, causeFromPrevious: i === 0 ? "" : p.causeFromPrevious || "Follows from the page before (offline template)." }));
    return {
      value: {
        homeWorld: `${v.name} at home near ${v.setting}, ${v.activity} as usual.`,
        heroWant: `${v.name} loves ${v.activity}.`,
        innerNeed: "",
        incitingIncident: `One day, something goes wrong in ${v.setting}.`,
        whyItMatters: `It spoils the thing ${v.name} loves most.`,
        whyTheHero: `${v.leader} asks ${v.name} for help, because ${v.name} knows the way.`,
        decision: `${v.name} decides to help.`,
        journeyStartsOnPage: k + 1,
        plants: [],
        openingPages,
      },
      usage: { provider: "mock", costUsd: 0 },
    };
  }

  async generateOutline(ctx: StoryContext): Promise<WithUsage<Outline>> {
    const v = buildVars(ctx);
    const n = ctx.options.length;
    const beats = ctx.theme.storyBeats;
    const pages = Array.from({ length: n }, (_, i) => {
      const stage = stageFor(i, n);
      const k = i - firstIndexOfStage(stage, n);
      const tpl = TEMPLATES[stage][k % TEMPLATES[stage].length];
      return {
        pageNumber: i + 1,
        beat: beats[Math.min(beats.length - 1, Math.floor((i * beats.length) / n))],
        summary: cap(fill(tpl.action, v)),
        causeFromPrevious: i === 0 ? "" : "Follows from the page before (offline template).",
        characters: tpl.who(v),
        visualState: "",
      };
    });
    return {
      value: {
        title: `${v.name} and the ${titleNoun(ctx.theme.name)}`,
        premise: fill(ctx.theme.pitch.replace(/^The child/i, "{name}"), v),
        worldRule: "",
        problem: "",
        goal: "",
        attempts: [],
        turningPoint: "",
        resolution: "",
        lessonShown: "",
        kidSummary: [],
        setups: [],
        continuity: [],
        characters: [
          { name: v.name, species: `a ${ctx.child.age}-year-old child`, look: ctx.appearance?.hero ?? "as on the character sheet" },
          ...(ctx.options.includePet && ctx.child.petName ? [{ name: ctx.child.petName, species: `a ${ctx.child.petType ?? "pet"}`, look: "the same colors and size on every page" }] : []),
          ...ctx.theme.supportingCast.slice(0, 4).map((c) => ({ name: c.name, species: c.role, look: c.look })),
        ],
        endingEcho: "",
        pages,
      },
      usage: mockUsage(),
    };
  }

  async generatePages(outline: Outline, ctx: StoryContext): Promise<WithUsage<StoryPagesResult>> {
    const v = buildVars(ctx);
    const n = ctx.options.length;
    const [minS, maxS] = READING_LEVEL_RULES[ctx.options.readingLevel].sentences;
    let spreadUsed = false;
    const castNames = (ctx.cast ?? []).map((c) => c.nickname || c.name);
    const pages: StoryPage[] = outline.pages.slice(0, n).map((op, i) => {
      const stage = stageFor(i, n);
      const k = i - firstIndexOfStage(stage, n);
      const tpl = TEMPLATES[stage][k % TEMPLATES[stage].length];
      const count = ctx.options.readingLevel === "4-6" ? (i % 2 === 0 ? minS : maxS) : maxS;
      const sentences = tpl.s.slice(0, Math.max(1, Math.min(count, 4))).map((s) => fill(s, v));
      let text = sentences.join(" ");
      if (voiceFor(ctx.options).id === "rhyming-mischief") {
        const [first, second] = RHYMES[stage][k % RHYMES[stage].length];
        const verse = (c: Couplet) => c.map((l) => fill(l, v, false)).join("\n");
        text =
          ctx.options.readingLevel === "2-4"
            ? verse(first)
            : ctx.options.readingLevel === "4-6"
              ? `${verse(first)}\n${verse(second)}`
              : `${tpl.s.slice(0, 2).map((s) => fill(s, v)).join(" ")}\n\n${verse(first)}`;
      }
      const { layout, textZone } = layoutFor(op.pageNumber, n, stage, spreadUsed);
      if (layout === "spread") spreadUsed = true;
      // The other real people join on the first page, the middle page and the last page.
      const castHere = castNames.length && (i === 0 || i === Math.floor(n / 2) || i === n - 1) ? castNames : [];
      const scene: Scene = {
        action: cap(fill(tpl.action, v)) + (castHere.length ? `, with ${castHere.join(" and ")} nearby` : ""),
        characters: [...tpl.who(v), ...castHere],
        setting: ctx.theme.setting,
        mood: tpl.mood,
        framing: fill(tpl.framing, v),
        mustShow: [cap(fill(tpl.action, v))],
        continuity: "",
      };
      return { pageNumber: op.pageNumber, text, scene, layout, textZone };
    });
    return {
      value: {
        pages,
        dedication: ctx.options.dedication || `For ${v.name}, who makes every day an adventure. With love.`,
        backCoverBlurb: `Join ${v.name} on a big adventure in ${v.setting} with ${v.leader}, ${v.helper} and ${v.sidekick}. A story about courage, kindness, and the magic of ${v.activity}.`,
        coverScene: {
          action: `${v.name} stands proudly in the center, smiling, with ${v.leader} and ${v.sidekick} beside`,
          characters: [v.name, v.leader, v.sidekick],
          setting: ctx.theme.setting,
          mood: ctx.theme.artDirection.mood,
          framing: "heroic full-body shot, open sky above for the title",
          mustShow: [`${v.name} smiling in the center`],
          continuity: "",
        },
        storySummary: `${outline.premise} (Offline template story: add an Anthropic key for a real story with a planned arc.)`,
        editorNotes: [],
      },
      usage: mockUsage(),
    };
  }

  async writeManuscript(outline: Outline, ctx: StoryContext, opts: ManuscriptOptions = {}): Promise<WithUsage<ManuscriptResult>> {
    await opts.onStage?.("writing");
    const r = (await this.generatePages(outline, ctx)).value;
    const value = { pages: r.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })), dedication: r.dedication, backCoverBlurb: r.backCoverBlurb, editorNotes: [] };
    await opts.save?.({ stage: "done", ...value });
    return { value, usage: mockUsage() };
  }

  async revisePages(_outline: Outline, pages: Array<{ pageNumber: number; text: string }>, target: number[], instruction: string): Promise<WithUsage<{ pages: Array<{ pageNumber: number; text: string }> }>> {
    const note = instruction.trim().replace(/\s+/g, " ").slice(0, 80);
    const changed = pages.filter((p) => target.includes(p.pageNumber)).map((p) => ({ pageNumber: p.pageNumber, text: `${p.text.replace(/ \(Revised: .*\)$/, "")} (Revised: ${note})` }));
    return { value: { pages: changed }, usage: mockUsage() };
  }

  /** Keeps the current plans, pointing each scene at the page's new words. */
  async directArt(outline: Outline, pages: ArtInputPage[], ctx: StoryContext): Promise<WithUsage<ArtDirection>> {
    const fresh = (await this.generatePages(outline, ctx)).value;
    return {
      value: {
        pages: pages.map((p) => {
          const base = fresh.pages.find((f) => f.pageNumber === p.pageNumber) ?? fresh.pages[0];
          const scene = p.scene ?? base.scene;
          return { pageNumber: p.pageNumber, scene: { ...scene, mustShow: [p.text.slice(0, 190)] }, layout: p.layout ?? base.layout, textZone: p.textZone ?? base.textZone };
        }),
        coverScene: fresh.coverScene,
        storySummary: fresh.storySummary,
      },
      usage: mockUsage(),
    };
  }

  async reviseText(page: { text: string }, instruction: string): Promise<WithUsage<{ text: string }>> {
    const note = instruction.trim().replace(/\s+/g, " ").slice(0, 80);
    return { value: { text: `${page.text} (Revised: ${note})` }, usage: mockUsage() };
  }

  async draftTheme(req: ThemeDraftRequest): Promise<WithUsage<ThemeConfig>> {
    return { value: mockDraftTheme(req), usage: mockUsage() };
  }

  async describeCharacter(_sheet: ImageData): Promise<WithUsage<CharacterBible>> {
    return {
      value: {
        hair: "short brown hair, slightly tousled",
        eyes: "brown",
        skinTone: "warm light-medium",
        faceShape: "round with full cheeks",
        glasses: "none",
        freckles: "none",
        signatureOutfit: "yellow t-shirt with a star, blue shorts, red sneakers",
        otherDetails: "",
      },
      usage: mockUsage(),
    };
  }
}

const MOCK_GENRES: Array<{ match: RegExp; genre: string; name: string; setting: string; palette: string[]; style: ThemeConfig["artDirection"]["defaultStyle"]; cast: ThemeConfig["supportingCast"] }> = [
  {
    match: /space|planet|rocket|star|moon|astronaut/i,
    genre: "space",
    name: "Moonbeam Voyage",
    setting: "The Glimmerway, a ribbon of friendly planets with candy-striped rings and a moon made of soft cheese",
    palette: ["#3949AB", "#9575CD", "#FFD54F", "#B2EBF2"],
    style: "soft-3d",
    cast: [
      { name: "Comet Kip", role: "co-pilot", look: "small silver robot with springy antennae and a heart-shaped light" },
      { name: "Nova Nell", role: "mission guide", look: "friendly astronaut grandma with a puffy orange suit" },
    ],
  },
  {
    match: /dino|dinosaur|fossil|t-rex|raptor/i,
    genre: "dinosaurs",
    name: "Fernstep Expedition",
    setting: "Fernstep Basin, a misty valley of giant ferns, warm springs and gentle volcano puffs",
    palette: ["#558B2F", "#C5E1A5", "#FF8A65", "#FFF3E0"],
    style: "watercolor-storybook",
    cast: [
      { name: "Bramble", role: "guide", look: "tall, gentle long-necked dinosaur with leafy freckles" },
      { name: "Pebble", role: "friend", look: "tiny round armored dinosaur who rolls into a ball when shy" },
    ],
  },
  {
    match: /ocean|sea|fish|whale|mermaid|shark|beach|underwater/i,
    genre: "ocean",
    name: "Tidepool Treasure",
    setting: "Shellhaven, a sparkling reef village with seaweed swings and pearl lanterns",
    palette: ["#0288D1", "#4DD0E1", "#FFCC80", "#E1F5FE"],
    style: "watercolor-storybook",
    cast: [
      { name: "Captain Coral", role: "guide", look: "cheerful pink octopus wearing a tiny captain's hat" },
      { name: "Flip", role: "friend", look: "bouncy young dolphin with a star-shaped mark" },
    ],
  },
  {
    match: /dragon|knight|castle|princess|prince|wizard|magic|fairy|unicorn/i,
    genre: "fantasy",
    name: "The Lantern Kingdom",
    setting: "Lanternvale, a hillside kingdom of glowing lanterns, crooked towers and singing meadows",
    palette: ["#7B1FA2", "#F48FB1", "#FFD54F", "#A5D6A7"],
    style: "paper-cutout",
    cast: [
      { name: "Sprig", role: "magical friend", look: "small green winged creature with acorn-cap hat" },
      { name: "Queen Marigold", role: "kind ruler", look: "smiling queen with a sunflower crown and a patched cloak" },
    ],
  },
  {
    match: /truck|digger|construction|car|train|tractor|vehicle|machine|build/i,
    genre: "vehicles",
    name: "Busy Builders",
    setting: "Puddleby Yard, a muddy work site at the edge of a cheerful town",
    palette: ["#F9A825", "#EF6C00", "#5D4037", "#90CAF9"],
    style: "crayon",
    cast: [
      { name: "Scoop", role: "loader", look: "round blue front loader with friendly headlights" },
      { name: "Gus Gearwell", role: "mechanic", look: "kind mechanic with a striped cap and a big wrench-shaped smile" },
    ],
  },
  {
    match: /hero|superhero|power|cape|save/i,
    genre: "superheroes",
    name: "Captain Kindness Club",
    setting: "Brightwater, a city of rooftop gardens and a cloud-shaped clubhouse",
    palette: ["#E53935", "#1E88E5", "#FFEE58", "#FFFFFF"],
    style: "bold-comic",
    cast: [
      { name: "Dash Daisy", role: "teammate", look: "girl in a green suit with daisy-shaped goggles" },
      { name: "Bolt Bear", role: "sidekick", look: "small teddy bear robot with lightning-bolt ears" },
    ],
  },
];

const DEFAULT_GENRE = {
  genre: "adventure",
  name: "The Wonder Walk",
  setting: "Hollyhock Hollow, a cozy village with winding paths, hidden gardens and a talking signpost",
  palette: ["#00897B", "#FFB74D", "#F06292", "#FFF8E1"],
  style: "watercolor-storybook" as const,
  cast: [
    { name: "Moss", role: "guide", look: "wise old tortoise with a tiny lantern on his shell" },
    { name: "Twig", role: "friend", look: "giggly squirrel with a long striped scarf" },
  ],
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export function mockDraftTheme(req: ThemeDraftRequest): ThemeConfig {
  const g = MOCK_GENRES.find((x) => x.match.test(req.description)) ?? DEFAULT_GENRE;
  const age = req.childAge ?? 5;
  const loves = req.description.replace(/\s+/g, " ").trim().slice(0, 140);
  return {
    id: `${slugify(g.name)}-${Math.random().toString(36).slice(2, 6)}`,
    name: g.name,
    genre: g.genre,
    ageRange: [Math.max(2, age - 2), Math.min(10, age + 2)],
    pitch: `The child sets off on a gentle ${g.genre} adventure inspired by what they love: ${loves}`,
    setting: g.setting,
    supportingCast: g.cast,
    storyBeats: ["cozy morning", "a surprise", "setting off", "a tricky moment", "a clever idea", "teamwork", "the big moment", "cozy ending"],
    powerIdeas: "The child's special talent connects to one of their favorite things.",
    artDirection: { defaultStyle: g.style, palette: g.palette, mood: "warm, curious, gently adventurous" },
    contentRules: ["cartoon peril only", "no weapons", "everyone is kind in the end"],
    licensed: false,
  };
}

function firstIndexOfStage(stage: Stage, n: number): number {
  for (let i = 0; i < n; i++) if (stageFor(i, n) === stage) return i;
  return 0;
}

function titleNoun(themeName: string): string {
  const map: Record<string, string> = {
    "Superhero Squad": "Brightside Brigade",
    "Space Explorer": "Lost Little Star",
    "Dinosaur Valley": "Time-Hopping Field Trip",
    "Ocean Deep": "Great Reef Rescue",
    "Dragon Knight": "Shy Little Dragon",
    "Construction Crew": "Brand-New Playground",
    "Topsy-Turvy Town": "Great Giggle-Bell Muddle",
  };
  return map[themeName] ?? `${themeName} Adventure`;
}
