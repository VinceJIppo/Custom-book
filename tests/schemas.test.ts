import { describe, expect, it } from "vitest";
import { loadBuiltInThemeFiles } from "@/lib/themes";
import { ThemeConfigSchema } from "@/lib/schemas/theme";
import { ChildProfileInputSchema } from "@/lib/schemas/child";
import { BookOptionsSchema, readingLevelForAge } from "@/lib/schemas/book";
import { StoryPagesResultSchema, validateStoryPages, type StoryPage } from "@/lib/schemas/story";
import { superhero } from "./helpers";

describe("built-in themes", () => {
  const themes = loadBuiltInThemeFiles();
  it("loads all nine, each valid", () => {
    expect(themes.map((t) => t.id).sort()).toEqual(
      ["construction-crew", "dinosaur-valley", "dragon-knight", "ocean-deep", "quiet-meadow", "space-explorer", "superhero-squad", "topsy-turvy-town", "wishing-garden"].sort(),
    );
  });
  it("hides Space Explorer, Superhero Squad and Dragon Knight from new books", () => {
    expect(themes.filter((t) => t.hidden).map((t) => t.id).sort()).toEqual(["dragon-knight", "space-explorer", "superhero-squad"]);
  });
  it("contain no protected characters, franchises or real authors", async () => {
    const { findProtectedNames } = await import("@/lib/safety/protectedNames");
    for (const t of themes) {
      expect(findProtectedNames(JSON.stringify(t))).toEqual([]);
      expect(JSON.stringify(t)).not.toMatch(/seuss|geisel|dahl|grinch|lorax|truffula|whoville|sneetch|cat in the hat/i);
    }
  });
  it("are never licensed and have unique ids", () => {
    expect(themes.every((t) => !t.licensed)).toBe(true);
    expect(new Set(themes.map((t) => t.id)).size).toBe(themes.length);
  });
});

describe("ThemeConfigSchema", () => {
  it("rejects bad palette colors and reversed age ranges", () => {
    const t = superhero();
    expect(ThemeConfigSchema.safeParse({ ...t, artDirection: { ...t.artDirection, palette: ["blue", "#FFF"] } }).success).toBe(false);
    expect(ThemeConfigSchema.safeParse({ ...t, ageRange: [8, 3] }).success).toBe(false);
  });
  it("rejects unknown art styles and missing cast", () => {
    const t = superhero();
    expect(ThemeConfigSchema.safeParse({ ...t, artDirection: { ...t.artDirection, defaultStyle: "anime" } }).success).toBe(false);
    expect(ThemeConfigSchema.safeParse({ ...t, supportingCast: [] }).success).toBe(false);
  });
});

describe("ChildProfileInputSchema", () => {
  const base = { firstName: "Zoë", age: "4", pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] };
  it("accepts accented names and coerces age", () => {
    const r = ChildProfileInputSchema.parse(base);
    expect(r.age).toBe(4);
  });
  it("rejects names with symbols, ages out of range, unknown pronouns", () => {
    expect(ChildProfileInputSchema.safeParse({ ...base, firstName: "<script>" }).success).toBe(false);
    expect(ChildProfileInputSchema.safeParse({ ...base, age: 30 }).success).toBe(false);
    expect(ChildProfileInputSchema.safeParse({ ...base, pronouns: "xe" }).success).toBe(false);
  });
});

describe("BookOptionsSchema", () => {
  const ok = { length: "16", readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };
  it("accepts only 12, 16, 20 or 24 pages", () => {
    expect(BookOptionsSchema.parse(ok).length).toBe(16);
    expect(BookOptionsSchema.safeParse({ ...ok, length: 14 }).success).toBe(false);
  });
  it("maps age to reading level", () => {
    expect([2, 3, 4, 5, 6, 8].map(readingLevelForAge)).toEqual(["2-4", "2-4", "4-6", "4-6", "6-8", "6-8"]);
  });
});

describe("story page validation", () => {
  const page = (n: number, layout: StoryPage["layout"] = "fullBleed"): StoryPage => ({
    pageNumber: n,
    text: "Hi.",
    scene: { action: "waves", characters: ["Teddy"], setting: "park", mood: "happy", framing: "wide", mustShow: ["Teddy waving"], continuity: "" },
    layout,
    textZone: "bottom",
  });
  it("passes a complete, ordered set", () => {
    expect(validateStoryPages(Array.from({ length: 12 }, (_, i) => page(i + 1)), 12)).toEqual([]);
  });
  it("reports wrong counts, gaps and too many spreads", () => {
    expect(validateStoryPages([page(1), page(2)], 12)[0]).toMatch(/exactly 12/);
    expect(validateStoryPages([page(1), page(3)], 2).join(" ")).toMatch(/without gaps/);
    expect(validateStoryPages([1, 2, 3, 4].map((n) => page(n, "spread")), 4).join(" ")).toMatch(/At most 2/);
  });
  it("result schema rejects an unknown layout", () => {
    const bad = { pages: [1, 2, 3, 4].map((n) => ({ ...page(n), layout: "collage" })), dedication: "For you", backCoverBlurb: "A fun adventure story.", coverScene: page(1).scene };
    expect(StoryPagesResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe("theme registry", () => {
  it("includes every JSON file in /themes", async () => {
    const fs = await import("node:fs");
    const onDisk = fs.readdirSync("themes").filter((f) => f.endsWith(".json")).sort();
    const { BUILT_IN_THEME_FILES } = await import("@/themes");
    expect(Object.keys(BUILT_IN_THEME_FILES).sort()).toEqual(onDisk);
  });
});

describe("config", () => {
  it("treats blank values from .env.example as not set", async () => {
    const { getConfig, resetConfigCache } = await import("@/lib/config");
    process.env.PUBLIC_BASE_URL = "";
    process.env.DAILY_COST_CAP_USD = " ";
    resetConfigCache();
    try {
      const c = getConfig();
      expect(c.PUBLIC_BASE_URL).toBeUndefined();
      expect(c.DAILY_COST_CAP_USD).toBe(10);
    } finally {
      delete process.env.PUBLIC_BASE_URL;
      delete process.env.DAILY_COST_CAP_USD;
      resetConfigCache();
    }
  });
});
