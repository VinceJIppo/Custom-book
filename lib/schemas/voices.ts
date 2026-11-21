import { z } from "zod";
import type { ReadingLevel } from "./book";

/**
 * Story voices: how the book sounds when read aloud. Each voice is a style
 * guide for the story writer plus per-reading-level rules that replace the
 * default ones (rhyming verse can't be "one short sentence per page").
 *
 * Voices describe qualities, never authors: naming authors pulls in their
 * lines, characters and coined words, which a printed book must not contain.
 */
export const VOICE_IDS = ["rhyming-mischief", "classic", "bedtime", "adventure"] as const;
export const VoiceIdSchema = z.enum(VOICE_IDS);
export type VoiceId = z.infer<typeof VoiceIdSchema>;

/** Every new book uses this voice unless the parent picks another. */
export const DEFAULT_VOICE: VoiceId = "rhyming-mischief";
/** Books made before voices existed were written in the classic voice. */
export const LEGACY_VOICE: VoiceId = "classic";

export interface Voice {
  id: VoiceId;
  label: string;
  /** One line for the wizard. */
  description: string;
  /** A tiny sample so parents can hear the voice before choosing. */
  sample: string;
  /** Style guide given to the story writer. */
  guide: string;
  /** Replaces the default reading-level rule for this voice (null = use the default). */
  readingLevels: Record<ReadingLevel, string> | null;
}

const NEVER_COPY =
  "Never quote or closely imitate any published book. Never use another author's invented words, catchphrases, characters or titles, and never mention real authors in the story.";

export const VOICES: Record<VoiceId, Voice> = {
  "rhyming-mischief": {
    id: "rhyming-mischief",
    label: "Rhyming and mischievous",
    description: "Bouncy rhymes, silly made-up words, a cheeky narrator and gloriously ridiculous grown-ups.",
    sample: "Now listen, dear reader, I'll tell you a thing:\nthe moon had gone missing. (It slipped off its string!)",
    guide: `Write in a gleeful, read-aloud voice that blends two traditions: buoyant rhyming verse and a mischievous storyteller.

Rhythm and rhyme
- Use rhyming couplets with a strong, regular bounce (da-da-DUM da-da-DUM). Read every line in your head; if the beat stumbles, rewrite it.
- Rhyme on stressed syllables. Never force a rhyme by twisting word order or picking a word that doesn't fit the meaning.
- Put each line of verse on its own line (use a line break between lines).
- Save the best rhyme for the last line on a page so turning the page feels like a reward.
- A short refrain may come back at most three times. Characters should say or chant it for a reason in the story, it changes slightly at the end, and it never states the lesson.
- The story always comes first: never let a rhyme bend what happens, add a filler word ("ho ho", "oh my"), or introduce something that isn't part of the plot. Use a near-rhyme or a plain line instead.

Invented words
- Invent a silly word on some pages, never more than one or two per page. They must be easy to pronounce, and their meaning must be clear from context ("a squishy, squelchy, splorchy bog").
- Make up every word yourself.

The narrator
- The narrator talks directly to the reader now and then ("Now, you may not believe this, but..."), shares secrets, and enjoys the chaos.
- Exaggerate gloriously: the biggest, wobbliest, most ridiculous version of everything. Lists of three that build to a funny topper are welcome.

Comedy with a warm heart
- Grown-ups and grumpy characters can be pompous, bumbling or silly, but nobody is cruel to the child, and no one is humiliated in a way that would upset a young reader.
- Mild gross-out fun (squelchy mud, a burp, a very smelly sock) is fine; anything frightening, violent or truly nasty is not.
- The child solves the problem through cleverness, kindness or a brilliant silly idea, and the ending is cozy and satisfying.

${NEVER_COPY}`,
    readingLevels: {
      "2-4": "One rhyming couplet per page (two short lines), short simple words, lots of repetition.",
      "4-6": "Two rhyming couplets per page (four short lines).",
      "6-8": "A short paragraph of lively prose per page, with a rhyming couplet or the refrain dropped in for fun on most pages.",
    },
  },
  classic: {
    id: "classic",
    label: "Classic storybook",
    description: "Warm, gentle prose with a clear story and a cozy ending.",
    sample: "Teddy looked up at the night sky. One little star was missing.",
    guide: `Write in a warm, classic picture-book voice: clear, gentle prose with a steady story rhythm. Simple, vivid images; a little repetition for young readers; a calm, satisfying ending. ${NEVER_COPY}`,
    readingLevels: null,
  },
  bedtime: {
    id: "bedtime",
    label: "Gentle bedtime",
    description: "Soft, soothing and slow, winding down to sleep. Perfect for the last book of the night.",
    sample: "The sea was hushed. The boats were still.\nAnd one small star rocked over the hill.",
    guide: `Write in a soft, soothing bedtime voice. Short, gentle sentences with a lulling, rocking rhythm; occasional soft rhymes are welcome but never bouncy. Use quiet sounds and cozy images (blankets, moonlight, slow breathing, warm light). The excitement stays low: any problem is small and solved calmly. Each page is a little slower and calmer than the one before, ending with the child drifting happily to sleep. ${NEVER_COPY}`,
    readingLevels: null,
  },
  adventure: {
    id: "adventure",
    label: "Big adventure",
    description: "Punchy, action-packed and funny, with sound effects and cliffhanger page turns.",
    sample: "WHOOSH! The rocket shot up. Then: clunk. Then: uh-oh.",
    guide: `Write in a punchy, high-energy adventure voice. Short, snappy sentences; bold sound effects (WHOOSH! KER-SPLASH!) that kids love to shout; quick back-and-forth dialogue; and page endings that make the reader desperate to turn the page. Keep the humor big and the peril cartoonish: exciting, never frightening. The child is brave, quick-thinking and saves the day. ${NEVER_COPY}`,
    readingLevels: null,
  },
};

export function voiceFor(options: { voice?: VoiceId | null }): Voice {
  return VOICES[options.voice ?? LEGACY_VOICE];
}
