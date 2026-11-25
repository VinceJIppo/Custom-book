import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createGrownUp, updateGrownUp } from "@/lib/children/service";
import { buildCharacterSheetPrompt, buildIllustrationPrompt } from "@/lib/providers/image/prompt";
import { hairLengthText } from "@/lib/schemas/child";
import type { IllustrationRequest } from "@/lib/providers/image/types";
import { makeUser, resetDb } from "./helpers";

describe("hair length for grown-up women", () => {
  let userId: string;
  beforeEach(async () => {
    await resetDb();
    userId = (await makeUser()).id;
  });

  it("is saved for women and dropped for men", async () => {
    const r = await createGrownUp(userId, { firstName: "Bina", nickname: "Mama", relationship: "Mom", pronouns: "she", hairLength: "long" });
    if (!r.ok) throw new Error(r.message);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: r.id } })).hairLength).toBe("long");
    await updateGrownUp(userId, r.id, { firstName: "Bina", relationship: "Mom", pronouns: "he", hairLength: "long" });
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: r.id } })).hairLength).toBeNull();
    // Not choosing one is fine; a made-up value isn't.
    expect((await createGrownUp(userId, { firstName: "Ana", relationship: "Aunt", pronouns: "she", hairLength: "" })).ok).toBe(true);
    expect((await createGrownUp(userId, { firstName: "Ana", relationship: "Aunt", pronouns: "she", hairLength: "very" })).ok).toBe(false);
  });

  it("goes into the character drawing and every page picture", () => {
    expect(buildCharacterSheetPrompt({ style: "crayon", variant: 0, subject: "grownup", hairLength: "short" })).toMatch(/short hair that ends above the shoulders, worn down, in all three views/);
    expect(buildCharacterSheetPrompt({ style: "crayon", variant: 0, subject: "grownup" })).not.toMatch(/hair must be drawn/);
    const req = {
      characterRef: null,
      bible: null,
      childName: "Teddy",
      scene: { action: "Teddy hugs Mama", characters: ["Teddy", "Mama"], setting: "kitchen", mood: "warm", framing: "wide", mustShow: [], continuity: "" },
      style: "crayon",
      aspect: 1,
      textZone: "top",
      palette: ["#123456"],
      label: "Page 3",
      cast: [{ name: "Mama", label: "Teddy's mom", image: null, bible: null, look: "curly black hair", hairLength: hairLengthText("long") }],
    } as IllustrationRequest;
    expect(buildIllustrationPrompt(req)).toContain("curly black hair; hair length: long hair that falls well past the shoulders");
  });
});
