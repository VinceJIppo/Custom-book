import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { resetConfigCache } from "@/lib/config";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { requestNewArt, reviseTextWithAI } from "@/lib/books/pages";
import { addPhoto, startCharacterSheet } from "@/lib/characters/service";
import { drainQueue } from "@/lib/jobs/runner";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { checkAllowance, getAllowance, tierFor, TIERS } from "@/lib/allowance";
import { makeUser, resetDb } from "./helpers";

const options = { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };

describe("allowance tiers", () => {
  it("move up with printed orders, and an admin override wins", () => {
    expect(tierFor(0).id).toBe("starter");
    expect(tierFor(1).id).toBe("member");
    expect(tierFor(2).id).toBe("member");
    expect(tierFor(3).id).toBe("star");
    expect(tierFor(0, "star").id).toBe("star");
    expect(tierFor(5, "nonsense").id).toBe("star");
    expect(TIERS.starter.limits.book).toBe(1);
    expect(TIERS.member.limits.book).toBeGreaterThan(TIERS.starter.limits.book);
    expect(TIERS.star.limits.book).toBeGreaterThan(TIERS.member.limits.book);
  });
});

describe("allowances in the app", () => {
  let userId: string;
  let childId: string;
  let themeId: string;
  beforeEach(async () => {
    process.env.ALLOWANCES_ENABLED = "true";
    resetConfigCache();
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser("first-timer@example.com")).id;
    themeId = (await listThemesForUser(userId)).find((t) => t.slug === "space-explorer")!.id;
    const child = await createChild(userId, { firstName: "Mia", age: 5, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    childId = child.id;
  });
  afterEach(() => {
    delete process.env.ALLOWANCES_ENABLED;
    resetConfigCache();
  });

  async function paidOrder() {
    const book = await db.book.findFirstOrThrow({ where: { userId } });
    await db.order.create({ data: { userId, bookId: book.id, provider: "mock", status: "shipped", paidAt: new Date(), totalCents: 2500 } });
  }

  it("a first-time customer gets one book; a printed order unlocks the monthly allowance", async () => {
    expect((await createAndStartBook(userId, { childId, themeId, options })).ok).toBe(true);
    await drainQueue();
    const second = await createAndStartBook(userId, { childId, themeId, options });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.message).toMatch(/first try/);
      expect(second.message).toMatch(/Order a printed copy of one of your books to become a Member/);
    }
    const a = await getAllowance(userId);
    expect(a).toMatchObject({ unlimited: false, paidOrders: 0 });
    expect(a.tier.id).toBe("starter");
    expect(a.remaining.book).toBe(0);

    await paidOrder();
    expect((await getAllowance(userId)).tier.id).toBe("member");
    expect((await createAndStartBook(userId, { childId, themeId, options })).ok).toBe(true);
  });

  it("failed books don't use up the allowance, and refunded orders don't count", async () => {
    const r = await createAndStartBook(userId, { childId, themeId, options });
    if (!r.ok) throw new Error(r.message);
    await db.book.update({ where: { id: r.bookId }, data: { status: "failed" } });
    expect(await checkAllowance(userId, "book")).toBeNull();
    await db.order.create({ data: { userId, provider: "mock", status: "refunded", paidAt: new Date() } });
    expect((await getAllowance(userId)).tier.id).toBe("starter");
  });

  it("limits picture redraws and AI rewrites, counting only real redraws", async () => {
    await db.user.update({ where: { id: userId }, data: { bonusRedraws: -(TIERS.starter.limits.redraw - 1) } });
    const r = await createAndStartBook(userId, { childId, themeId, options });
    if (!r.ok) throw new Error(r.message);
    await drainQueue();
    // The book's own 13 illustrations are not redraws.
    expect((await getAllowance(userId)).used.redraw).toBe(0);
    const pages = await db.page.findMany({ where: { bookId: r.bookId, kind: "story" }, orderBy: { index: "asc" } });
    expect((await requestNewArt(userId, pages[0].id, "redraw")).ok).toBe(true);
    await drainQueue();
    const blocked = await requestNewArt(userId, pages[1].id, "redraw", "make her smile");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/picture redraw/);

    await db.generationJob.createMany({
      data: Array.from({ length: TIERS.starter.limits.rewrite }, () => ({ type: "page.revise", status: "succeeded", payload: {}, userId })),
    });
    const rewrite = await reviseTextWithAI(userId, pages[0].id, "shorter");
    expect(rewrite.ok).toBe(false);
  });

  it("first-timers can try a few character sets (more than one child is fine)", async () => {
    const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#d0b090" } }).jpeg().toBuffer();
    await addPhoto(userId, childId, photo, true);
    for (let i = 0; i < TIERS.starter.limits.character; i++) {
      const style = ["crayon", "bold-comic", "soft-3d", "paper-cutout"][i % 4];
      const r = await startCharacterSheet(userId, childId, { style });
      expect(r.ok).toBe(true);
      await drainQueue();
    }
    const over = await startCharacterSheet(userId, childId, { style: "watercolor-storybook" });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toMatch(/character sets/);
  });

  it("an admin reset starts the character count again, for the account and for each person", async () => {
    const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#d0b090" } }).jpeg().toBuffer();
    await addPhoto(userId, childId, photo, true);
    // Use up the per-person limit in one style (3 sets by default)...
    for (let i = 0; i < 3; i++) {
      expect((await startCharacterSheet(userId, childId, { style: "crayon" })).ok).toBe(true);
      await drainQueue();
    }
    const blocked = await startCharacterSheet(userId, childId, { style: "crayon" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/limit/);
    expect((await getAllowance(userId)).used.character).toBe(3);
    // ...then an admin resets the account's character count.
    await new Promise((r) => setTimeout(r, 5));
    await db.user.update({ where: { id: userId }, data: { characterResetAt: new Date() } });
    const after = await getAllowance(userId);
    expect(after.used.character).toBe(0);
    expect(after.characterResetAt).toBeInstanceOf(Date);
    expect((await startCharacterSheet(userId, childId, { style: "crayon" })).ok).toBe(true);
    await drainQueue();
    // Earlier sets are still there; only the count starts again.
    expect(await db.characterSheet.count({ where: { childId } })).toBe(4);
    expect((await getAllowance(userId)).used.character).toBe(1);
  });

  it("admins are unlimited, and bonus grants add to the tier", async () => {
    const admin = await makeUser("owner@example.com");
    process.env.ADMIN_EMAILS = "owner@example.com";
    resetConfigCache();
    try {
      expect((await getAllowance(admin.id)).unlimited).toBe(true);
    } finally {
      delete process.env.ADMIN_EMAILS;
      resetConfigCache();
    }
    await db.user.update({ where: { id: userId }, data: { bonusBooks: 2 } });
    const a = await getAllowance(userId);
    expect(a.limits.book).toBe(3);
  });

  it("can be switched off entirely", async () => {
    process.env.ALLOWANCES_ENABLED = "false";
    resetConfigCache();
    await db.generationJob.createMany({ data: Array.from({ length: 50 }, () => ({ type: "page.revise", status: "succeeded", payload: {}, userId })) });
    expect(await checkAllowance(userId, "rewrite")).toBeNull();
  });
});
