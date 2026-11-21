import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { addPhoto, approveSheetOption, approvedSheetFor, deleteCharacterSheet, roundsUsed, startCharacterSheet } from "@/lib/characters/service";
import { drainQueue } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { resetProviders } from "@/lib/providers/registry";
import { makeUser, resetDb } from "./helpers";

describe("deleting characters", () => {
  let userId: string;
  let childId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    userId = (await makeUser()).id;
    const child = await createChild(userId, { firstName: "Mia", age: 5, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    childId = child.id;
    const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#d0b090" } }).jpeg().toBuffer();
    await db.childProfile.update({ where: { id: childId }, data: { deleteOriginalsAfterApproval: false } });
    await addPhoto(userId, childId, photo, true);
  });

  async function approved(style: string) {
    const r = await startCharacterSheet(userId, childId, { style });
    if (!r.ok) throw new Error(r.message);
    await drainQueue();
    await approveSheetOption(userId, r.sheetId, 0);
    await drainQueue();
    return db.characterSheet.findUniqueOrThrow({ where: { id: r.sheetId } });
  }

  it("erases the pictures, keeps the try counted, and moves the active character to another style", async () => {
    const crayon = await approved("crayon");
    const comic = await approved("bold-comic");
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: childId } })).activeCharacterSheetId).toBe(comic.id);
    const keys = comic.imageKeys as string[];
    const kept = keys[comic.selectedIndex!];
    expect(await getStorage().exists(kept)).toBe(true);

    expect((await deleteCharacterSheet(userId, comic.id)).ok).toBe(true);
    const gone = await db.characterSheet.findUniqueOrThrow({ where: { id: comic.id } });
    expect(gone).toMatchObject({ status: "deleted", selectedIndex: null, bible: null });
    expect(await getStorage().exists(kept)).toBe(false);
    expect(await approvedSheetFor(childId, "bold-comic")).toBeNull();
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: childId } })).activeCharacterSheetId).toBe(crayon.id);
    // Deleting doesn't give the try back.
    expect(await roundsUsed(childId, "bold-comic")).toBe(1);
    expect((await deleteCharacterSheet(userId, comic.id)).ok).toBe(false);
  });

  it("discards a set of options before one is picked", async () => {
    const r = await startCharacterSheet(userId, childId, { style: "crayon" });
    if (!r.ok) throw new Error(r.message);
    // Still drawing: can't delete yet.
    const busy = await deleteCharacterSheet(userId, r.sheetId);
    expect(busy.ok).toBe(false);
    await drainQueue();
    const draft = await db.characterSheet.findUniqueOrThrow({ where: { id: r.sheetId } });
    expect(draft.status).toBe("draft");
    expect((await deleteCharacterSheet(userId, r.sheetId)).ok).toBe(true);
    for (const k of draft.imageKeys as string[]) expect(await getStorage().exists(k)).toBe(false);
  });

  it("only the owner can delete", async () => {
    const sheet = await approved("crayon");
    const other = await makeUser("other@example.com");
    expect((await deleteCharacterSheet(other.id, sheet.id)).ok).toBe(false);
    expect((await db.characterSheet.findUniqueOrThrow({ where: { id: sheet.id } })).status).toBe("approved");
  });
});
