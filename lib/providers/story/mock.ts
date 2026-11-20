import type { StoryContext, StoryProvider } from "./types";
import type { CharacterBible, Outline, Scene, StoryLayout, StoryPage, StoryPagesResult, TextZone } from "../../schemas/story";
import { READING_LEVEL_RULES } from "../../schemas/book";
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
        "Along the way, they spotted a friendly {animal}.",
        "The {animal} wanted to come along too, so now the team was even bigger.",
        "{name} shared a snack of {food}, and everyone agreed it was delicious.",
        "\"Every adventure is better with friends,\" said {sidekick}.",
      ],
      "{name} meets a friendly {animal} and shares a snack",
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
    animal: child.favorites.animals[0]?.toLowerCase() ?? "bunny",
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

function fill(s: string, v: Vars): string {
  const extra: Record<string, string> = {
    companionLine: v.companion ? `${v.companion} always joined in, wagging and bouncing.` : "Sometimes the birds joined in too.",
    companionHelpLine: v.companionShort
      ? `${v.companionShort} helped too${v.friend ? `, and so did ${v.friend}` : ""}.`
      : v.friend
        ? `${v.friend} helped too.`
        : "Even the birds helped.",
    companionNightLine: v.companionShort ? `${v.companionShort} curled up at the foot of the bed.` : "The stars twinkled outside the window.",
    lessonLine: v.lessonLine ?? "{name} remembered that the best ideas come from a calm, kind heart.",
  };
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/\{(\w+)\}/g, (m, k: string) => {
      if (k in extra) return extra[k];
      const val = (v as unknown as Record<string, unknown>)[k];
      return typeof val === "string" ? val : m;
    });
  }
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
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
        characters: tpl.who(v),
      };
    });
    return {
      value: {
        title: `${v.name} and the ${titleNoun(ctx.theme.name)}`,
        premise: fill(ctx.theme.pitch.replace(/^The child/i, "{name}"), v),
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
    const pages: StoryPage[] = outline.pages.slice(0, n).map((op, i) => {
      const stage = stageFor(i, n);
      const k = i - firstIndexOfStage(stage, n);
      const tpl = TEMPLATES[stage][k % TEMPLATES[stage].length];
      const count = ctx.options.readingLevel === "4-6" ? (i % 2 === 0 ? minS : maxS) : maxS;
      const sentences = tpl.s.slice(0, Math.max(1, Math.min(count, 4))).map((s) => fill(s, v));
      const { layout, textZone } = layoutFor(op.pageNumber, n, stage, spreadUsed);
      if (layout === "spread") spreadUsed = true;
      const scene: Scene = {
        action: cap(fill(tpl.action, v)),
        characters: tpl.who(v),
        setting: ctx.theme.setting,
        mood: tpl.mood,
        framing: fill(tpl.framing, v),
      };
      return { pageNumber: op.pageNumber, text: sentences.join(" "), scene, layout, textZone };
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
        },
      },
      usage: mockUsage(),
    };
  }

  async reviseText(page: { text: string }, instruction: string): Promise<WithUsage<{ text: string }>> {
    const note = instruction.trim().replace(/\s+/g, " ").slice(0, 80);
    return { value: { text: `${page.text} (Revised: ${note})` }, usage: mockUsage() };
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
  };
  return map[themeName] ?? `${themeName} Adventure`;
}
