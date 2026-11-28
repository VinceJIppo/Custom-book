import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { ensurePrintFiles, productsForBook } from "@/lib/books/export";
import { orderableExports } from "@/lib/orders/service";
import { drainQueue } from "@/lib/jobs/runner";
import { resetConfigCache } from "@/lib/config";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { HOUSE_STYLE, HOUSE_THEME_ID } from "@/lib/schemas/theme";
import { makeUser, resetDb } from "./helpers";

describe("ordering straight from the book", () => {
  let userId: string;
  let bookId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === HOUSE_THEME_ID)!.id;
    const child = await createChild(userId, { firstName: "Isla", age: 5, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options: { length: 12, readingLevel: "4-6", style: HOUSE_STYLE, trimSize: "square-8.5", includePet: false, includeFriend: false, starterId: "lumas-glow", voice: "quiet-wisdom" } });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
  });
  afterEach(() => {
    process.env.AUTO_PRINT_FILES = "false";
    resetConfigCache();
  });

  it("only hardcover is offered to parents", async () => {
    expect((await productsForBook("square-8.5", { offeredOnly: true })).map((p) => p.binding)).toEqual(["hardcover"]);
    expect((await productsForBook("square-8.5")).some((p) => p.binding === "softcover")).toBe(true);
  });

  it("a finished book gets its hardcover print files on its own, ready to order", async () => {
    process.env.AUTO_PRINT_FILES = "true";
    resetConfigCache();
    await drainQueue();
    const exp = await db.bookExport.findMany({ where: { bookId } });
    expect(exp).toHaveLength(1);
    expect(exp[0]).toMatchObject({ productId: "hardcover-square-8.5", status: "ready", preflightOk: true });
    const { exports } = await orderableExports(userId, bookId);
    expect(exports).toHaveLength(1);
    expect(await ensurePrintFiles(userId, bookId)).toEqual({ state: "ready" });
  }, 120_000);

  it("the order page makes them if they're missing, and doesn't start a second copy", async () => {
    await drainQueue(); // finished without automatic files (off in tests)
    expect(await db.bookExport.count({ where: { bookId } })).toBe(0);
    expect(await ensurePrintFiles(userId, bookId)).toMatchObject({ state: "making" });
    expect(await ensurePrintFiles(userId, bookId)).toMatchObject({ state: "making" });
    await drainQueue();
    expect(await db.bookExport.count({ where: { bookId } })).toBe(1);
    expect(await ensurePrintFiles(userId, bookId)).toEqual({ state: "ready" });
  }, 120_000);

  it("print files stuck 'being made' with no job behind them are started again, not waited on forever", async () => {
    await drainQueue();
    expect(await ensurePrintFiles(userId, bookId)).toMatchObject({ state: "making" });
    // The worker died mid-render: the job failed for good and nothing is working on the files.
    await db.generationJob.updateMany({ where: { bookId, type: "book.export" }, data: { status: "failed" } });
    const stuck = await db.bookExport.findFirstOrThrow({ where: { bookId } });
    expect(stuck.status).toBe("rendering");
    expect(await ensurePrintFiles(userId, bookId)).toMatchObject({ state: "making" });
    expect((await db.bookExport.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("failed");
    expect(await db.bookExport.count({ where: { bookId, status: "rendering" } })).toBe(1);
    await drainQueue();
    expect(await ensurePrintFiles(userId, bookId)).toEqual({ state: "ready" });
  }, 180_000);
});
