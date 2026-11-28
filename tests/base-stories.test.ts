import { describe, expect, it } from "vitest";
import { loadBuiltInThemeFiles } from "@/lib/themes";
import { familyPartFor, familyPartLabels, houseStories, HOUSE_STYLE, HOUSE_THEME_ID, type ThemeConfig } from "@/lib/schemas/theme";
import { describeContext, NO_GROWN_UP } from "@/lib/providers/anthropic/storyPrompts";
import type { StoryContext } from "@/lib/providers/story/types";
import type { CastMemberSnapshot } from "@/lib/schemas/child";

const stories = houseStories(loadBuiltInThemeFiles());
const themes = stories.map((s) => s.theme);

describe("base stories", () => {
  it("each have their own world, starting with Luma's Lost Glow in the Wishing Garden", () => {
    expect(stories.length).toBeGreaterThanOrEqual(6);
    expect(stories[0].starter.id).toBe("lumas-glow");
    expect(stories[0].theme.id).toBe(HOUSE_THEME_ID);
    // One story per world, so no two stories share a setting or its characters.
    expect(new Set(themes.map((t) => t.id)).size).toBe(stories.length);
    for (const t of themes) {
      expect(t.starters).toHaveLength(1);
      expect(t.artDirection.defaultStyle).toBe(HOUSE_STYLE);
    }
  });

  it("are all told in the quiet wisdom voice, with a summary and one main trait for the card", () => {
    for (const { starter } of stories) {
      expect(starter.voice).toBe("quiet-wisdom");
      expect(starter.summary).toBeTruthy();
      expect(starter.trait).toBeTruthy();
      expect(starter.title).not.toMatch(/[,–—]/);
    }
    const traits = stories.map((s) => s.starter.trait!.toLowerCase());
    expect(new Set(traits).size).toBe(traits.length);
  });

  it("never share a character", () => {
    const names = themes.flatMap((t) => t.supportingCast.map((c) => c.name.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });

  it("never write a parent or sibling into the story itself (family members come only from the parent)", () => {
    const family = /\b(mom|mommy|mum|mama|dad|daddy|papa|brother|sister|sibling|grandma|grandpa|grandmother|grandfather|granny|aunt|uncle)s?\b/i;
    for (const t of themes) {
      const s = t.starters![0];
      const storyText = [t.pitch, t.setting, ...t.storyBeats, t.powerIdeas ?? "", ...t.contentRules, s.summary ?? "", s.idea];
      for (const line of storyText) expect(line, `${t.id}: ${line}`).not.toMatch(family);
    }
  });

  it("each offer parts for a grown-up and for younger and older children, and say what happens with no grown-up", () => {
    for (const t of themes) {
      expect(t.familyParts?.grownUp, t.id).toBeTruthy();
      expect(t.familyParts?.youngerChild, t.id).toBeTruthy();
      expect(t.familyParts?.olderChild, t.id).toBeTruthy();
      expect(t.familyParts?.withoutGrownUp, t.id).toBeTruthy();
    }
  });
});

describe("family parts", () => {
  const parts = { grownUp: "Waits at the door.", youngerChild: "Holds the bucket.", olderChild: "Cheers from the step.", withoutGrownUp: "A voice from the doorway." };
  it("pick the part by who the person is: a grown-up, or a child younger or older than the hero", () => {
    expect(familyPartFor(parts, { kind: "grownup" }, 5)).toBe("Waits at the door.");
    expect(familyPartFor(parts, { kind: "child", age: 3 }, 5)).toBe("Holds the bucket.");
    expect(familyPartFor(parts, { kind: "child", age: 8 }, 5)).toBe("Cheers from the step.");
    expect(familyPartFor({ grownUp: "Waits at the door." }, { kind: "child", age: 3 }, 5)).toBeUndefined();
    expect(familyPartFor(undefined, { kind: "grownup" }, 5)).toBeUndefined();
    expect(familyPartLabels(parts)).toEqual(["a grown-up", "a younger child", "an older child"]);
  });

  const snow = themes.find((t) => t.id === "first-big-snow") as ThemeConfig;
  const ctx = (cast: CastMemberSnapshot[]): StoryContext => ({
    child: { id: "c1", firstName: "Isla", age: 5, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] },
    cast,
    theme: snow,
    options: { length: 16, readingLevel: "4-6", style: HOUSE_STYLE, trimSize: "square-8.5", includePet: false, includeFriend: false, starterId: "snow-house" },
  });
  const brief = (cast: CastMemberSnapshot[]) => JSON.parse(describeContext(ctx(cast)));

  it("send the writer only the parts for people the parent added, and nothing about anyone else", () => {
    const alone = brief([]);
    expect(alone.otherPeopleInTheStory).toBeNull();
    expect(alone.family.ifNoGrownUp).toBe(snow.familyParts!.withoutGrownUp);
    expect(JSON.stringify(alone)).not.toContain(snow.familyParts!.youngerChild!);
    expect(JSON.stringify(alone)).not.toContain(snow.familyParts!.grownUp!);
    expect(JSON.stringify(alone)).not.toContain("familyParts");

    const withBaby = brief([{ id: "p1", kind: "child", name: "Max", age: 2, pronouns: "he" }]);
    expect(withBaby.otherPeopleInTheStory[0].theirPartInThisStory).toBe(snow.familyParts!.youngerChild);
    expect(withBaby.family.ifNoGrownUp).toBe(snow.familyParts!.withoutGrownUp);

    const withDad = brief([{ id: "p2", kind: "grownup", name: "Sam", relationship: "Dad", pronouns: "he" }]);
    expect(withDad.otherPeopleInTheStory[0].theirPartInThisStory).toBe(snow.familyParts!.grownUp);
    expect(withDad.family.ifNoGrownUp).toBeNull();
  });

  it("let the parent's own words for a person win over the story's part", () => {
    const b = brief([{ id: "p2", kind: "grownup", name: "Sam", relationship: "Dad", pronouns: "he", part: "Dad builds a snowman that looks just like the dog." }]);
    expect(b.otherPeopleInTheStory[0].theirPartInThisStory).toBe("Dad builds a snowman that looks just like the dog.");
  });

  it("fall back to an unnamed grown-up with no face when a world has no rule of its own", () => {
    const b = JSON.parse(describeContext({ ...ctx([]), theme: { ...snow, familyParts: undefined } }));
    expect(b.family.ifNoGrownUp).toBe(NO_GROWN_UP);
    expect(NO_GROWN_UP).toMatch(/never Mom, Dad/);
  });
});
