import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { addPhoto } from "@/lib/characters/service";
import { createChild } from "@/lib/children/service";
import { resetProviders } from "@/lib/providers/registry";
import { MockVisionProvider } from "@/lib/providers/vision/mock";
import { makeUser, resetDb } from "./helpers";

describe("photos with more than one face", () => {
  let userId: string;
  let childId: string;
  beforeEach(async () => {
    await resetDb();
    userId = (await makeUser()).id;
    const c = await createChild(userId, { firstName: "Theo", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!c.ok) throw new Error("child");
    childId = c.id;
  });
  afterEach(() => resetProviders());

  it("is not stored, and comes back with the main face to crop around", async () => {
    const vision = new MockVisionProvider();
    vision.checkPhoto = async () => ({
      value: { faces: 2, ok: false, problems: ["We found 2 faces."], mainFace: { left: 0.2, top: 0.1, width: 0.2, height: 0.25 }, cropWouldHelp: true },
      usage: { provider: "fake", costUsd: 0 },
    });
    resetProviders({ vision });
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#abcdef" } }).jpeg().toBuffer();
    const r = await addPhoto(userId, childId, photo, true);
    expect(r).toMatchObject({ ok: false, crop: { left: 0.2, top: 0.1, width: 0.2, height: 0.25 } });
    expect(await db.childPhoto.count({ where: { childId } })).toBe(0);
  });
});
