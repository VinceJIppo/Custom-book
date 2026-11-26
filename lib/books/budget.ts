/**
 * How much story fits in a book. A 12-page book for ages 4 to 6 has about 350
 * words: too many characters, tries and threads and the "because" and "so"
 * sentences get squeezed out, which is what makes a story stop making sense.
 * The plan stays inside this budget; everything else is optional.
 */
export interface StoryBudget {
  /** Named made-up characters (theme characters, the pet, a friend) with a real part. */
  helpers: number;
  /** Real people (family, friends) who get a real part; the rest appear warmly in a cameo. */
  realParts: number;
  /** Failed tries before the one that works: [fewest, most]. */
  attempts: [number, number];
}

export function storyBudget(storyPages: number): StoryBudget {
  if (storyPages <= 12) return { helpers: 2, realParts: 2, attempts: [1, 1] };
  if (storyPages <= 16) return { helpers: 2, realParts: 2, attempts: [1, 2] };
  if (storyPages <= 20) return { helpers: 3, realParts: 3, attempts: [2, 2] };
  return { helpers: 3, realParts: 3, attempts: [2, 3] };
}

/** The budget as instructions for the planner and writer. */
export function budgetText(storyPages: number): string {
  const b = storyBudget(storyPages);
  const tries = b.attempts[0] === b.attempts[1] ? `exactly ${b.attempts[0]}` : `${b.attempts[0]} or ${b.attempts[1]}`;
  return [
    `STORY BUDGET for ${storyPages} pages (a simple story a child can follow beats a crowded one):`,
    "- One problem, one goal, one clear chain of cause and effect. No side quests.",
    `- At most ${b.helpers} named made-up characters (theme characters, the pet, a friend) with a real part. Theme characters are optional: use only the ones the story needs, and leave the rest out.`,
    `- At most ${b.realParts} real people (from otherPeopleInTheStory) with a real part. If there are more, the others appear warmly in a cameo (a hug, a wave, cheering at the end), and the person storyCentersOn always gets a real part.`,
    `- ${tries} failed ${b.attempts[1] === 1 ? "try" : "tries"} before the one that works.`,
    "- Every named character is introduced in a way a listener understands (who they are, why they're there) the first time they appear.",
  ].join("\n");
}

/** Plain-English problems with a plan that's over budget (empty when it fits). */
export function budgetProblems(attempts: number, storyPages: number): string[] {
  const b = storyBudget(storyPages);
  if (attempts < b.attempts[0] || attempts > b.attempts[1])
    return [`Plan ${b.attempts[0] === b.attempts[1] ? b.attempts[0] : `${b.attempts[0]} or ${b.attempts[1]}`} failed ${b.attempts[1] === 1 ? "try" : "tries"} for a ${storyPages}-page book (you planned ${attempts}).`];
  return [];
}
