import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import sharp from "sharp";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { startExport } from "@/lib/books/export";
import { drainQueue } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { inspectPdf } from "@/lib/print/pdfInspect";
import { featherToWhite } from "@/lib/print/render";
import type { PreflightReport } from "@/lib/print/preflight";
import { makeUser, resetDb } from "./helpers";

describe("gentle (vignette) pages in print", () => {
  let userId: string;
  let bookId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "quiet-meadow")!.id;
    const child = await createChild(userId, { firstName: "Charlie", age: 3, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options: { length: 12, readingLevel: "6-8", style: "gentle-ink-wash", trimSize: "square-8.5", includePet: false, includeFriend: false } });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
    await drainQueue();
  });

  it("long words push the picture down instead of being cut off; pictures blend into the page", async () => {
    // An off-white painting background (the grey box seen in printed vignettes).
    const art = await sharp({ create: { width: 2048, height: 1600, channels: 3, background: "#f3f1ee" } })
      .composite([{ input: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#9a7b5a" } }).png().toBuffer(), left: 574, top: 350 }])
      .png()
      .toBuffer();
    const pages = await db.page.findMany({ where: { bookId, kind: "story" }, orderBy: { index: "asc" } });
    for (const p of pages) {
      const key = p.imageKey!.replace(/\.svg$/, ".png");
      await getStorage().put(key, art, "image/png");
      await db.page.update({ where: { id: p.id }, data: { imageKey: key } });
    }
    await db.page.update({
      where: { id: pages[1].id },
      data: { text: "Bramble sits down on the log bench, a fallen log beside the path, and his scarf falls in a heap. \"What if it goes somewhere far away and scary?\" he whispers. Old Willa thinks for a long, slow moment. \"A leaf can go where we cannot,\" she says, and she opens her cloth bag full of leaves." },
    });
    const r = await startExport(userId, bookId, "hardcover-square-8.5");
    if (!r.ok) throw new Error(r.message);
    await drainQueue();
    const exp = await db.bookExport.findUniqueOrThrow({ where: { id: r.exportId } });
    const report = exp.preflight as unknown as PreflightReport;
    expect(report.items.filter((i) => i.level === "error")).toEqual([]);
    const pdf = (await getStorage().get(exp.interiorKey!))!.data;
    expect((await inspectPdf(pdf)).transparency).toEqual([]);
    if (process.env.SAVE_VIGNETTE_PDF) fs.writeFileSync(process.env.SAVE_VIGNETTE_PDF, pdf);

    // The edges of a feathered picture are pure white; the middle keeps the painting.
    const out = await sharp(await featherToWhite(art)).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => out.data[(y * out.info.width + x) * out.info.channels];
    expect(px(2, 2)).toBeGreaterThanOrEqual(253);
    expect(px(1024, 100)).toBeGreaterThanOrEqual(253); // the off-white background is lifted to paper white
    expect(px(1024, 800)).toBeLessThan(200);
  }, 180_000);
});
