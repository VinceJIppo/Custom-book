import { describe, expect, it } from "vitest";
import { checkFieldsForProtectedNames, findProtectedNames } from "@/lib/safety/protectedNames";
import { MockModerationProvider } from "@/lib/providers/moderation/mock";
import { sanitize, errorMessage } from "@/lib/log";

describe("protected names", () => {
  it.each([
    ["He loves Spider-Man", "Spider-Man"],
    ["spiderman pajamas", "Spider-Man"],
    ["spider man", "Spider-Man"],
    ["PAW PATROL!!", "Paw Patrol"],
    ["a Pokémon adventure", "Pokemon"],
    ["make it like star wars", "Star Wars"],
    ["she watches bluey every day", "Bluey"],
    ["lego bricks", "Lego"],
  ])("flags %s", (text, name) => {
    expect(findProtectedNames(text)[0]?.name).toBe(name);
  });

  it.each(["frozen yogurt", "Mario is my neighbor", "a spider and a man", "building blocks", "superheroes and capes", "blue whale"])(
    "does not flag %s",
    (text) => {
      expect(findProtectedNames(text)).toEqual([]);
    },
  );

  it("explains and suggests original themes in the same genre, without rewriting", () => {
    const m = findProtectedNames("Batman")[0];
    expect(m.message).toMatch(/trademarked/);
    expect(m.message).not.toMatch(/dark|cape|mask|cowl/i);
    expect(m.suggestedThemeIds).toContain("superhero-squad");
  });

  it("checks list fields and reports which field matched", () => {
    const r = checkFieldsForProtectedNames({ "favorites.colors": ["red"], "favorites.activities": ["dancing", "playing Minecraft"] });
    expect(r?.field).toBe("favorites.activities");
  });
});

describe("mock moderation", () => {
  const mod = new MockModerationProvider();
  it("passes gentle text and blocks violent text", async () => {
    expect((await mod.check("loves pancakes and dancing")).ok).toBe(true);
    expect((await mod.check("he has a gun")).ok).toBe(false);
    expect((await mod.check("hello there")).ok).toBe(true); // "hell" inside a word is fine
  });
});

describe("log sanitizer", () => {
  it("never logs image bytes or base64", () => {
    const b64 = "A".repeat(5000);
    const out = sanitize({ data: b64, img: Buffer.alloc(2048), nested: { url: `data:image/png;base64,${b64}` }, image: "mock" }) as Record<string, unknown>;
    const s = JSON.stringify(out);
    expect(s).not.toContain("AAAAAAAAAA");
    expect(s).toContain("binary 2048 bytes");
    expect(out.image).toBe("mock");
  });
  it("truncates long error messages", () => {
    expect(errorMessage(new Error("x".repeat(5000))).length).toBeLessThanOrEqual(1000);
  });
});
