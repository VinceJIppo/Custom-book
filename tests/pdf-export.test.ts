import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { startExport, startValidation } from "@/lib/books/export";
import { drainQueue } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { inspectPdf } from "@/lib/print/pdfInspect";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { PrintRouter } from "@/lib/providers/print/router";
import { MockPrintProvider } from "@/lib/providers/print/mock";
import type { PreflightReport } from "@/lib/print/preflight";
import { makeUser, resetDb } from "./helpers";

describe("PDF inspection", () => {
  it("spots fonts that are not embedded", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.drawText("hello", { font: await doc.embedFont(StandardFonts.Helvetica) });
    const r = await inspectPdf(await doc.save());
    expect(r.pageSizesIn[0]).toEqual({ width: 8.5, height: 11 });
    expect(r.fonts.some((f) => !f.embedded)).toBe(true);
  });
});

describe("print export (real headless Chromium)", () => {
  let userId: string;
  let bookId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "ocean-deep")!.id;
    const child = await createChild(userId, { firstName: "Isla", age: 5, pronouns: "she", favorites: { colors: ["teal"], animals: [], foods: [], activities: ["swimming"] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options: { length: 12, readingLevel: "4-6", style: "watercolor-storybook", trimSize: "square-8.5", includePet: false, includeFriend: false } });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
    await drainQueue();
  });

  async function exportAndRead(productId: string) {
    const r = await startExport(userId, bookId, productId);
    if (!r.ok) throw new Error(r.message);
    await drainQueue();
    const exp = await db.bookExport.findUniqueOrThrow({ where: { id: r.exportId } });
    return exp;
  }

  it("renders interior and cover that pass preflight, then the printer check", async () => {
    const exp = await exportAndRead("hardcover-square-8.5");
    expect(exp.status).toBe("ready");
    const report = exp.preflight as unknown as PreflightReport;
    expect(report.items.filter((i) => i.level === "error")).toEqual([]);
    expect(exp.preflightOk).toBe(true);
    expect(exp.pageCount).toBe(24);

    const interior = await inspectPdf((await getStorage().get(exp.interiorKey!))!.data);
    expect(interior.pageCount).toBe(24);
    expect(interior.pageSizesIn.every((s) => s.width === 8.75 && s.height === 8.75)).toBe(true);
    expect(interior.fonts.length).toBeGreaterThan(0);
    expect(interior.fonts.every((f) => f.embedded)).toBe(true);
    expect(interior.transparency).toEqual([]);
    expect(interior.encrypted).toBe(false);
    const cover = await inspectPdf((await getStorage().get(exp.coverKey!))!.data);
    expect(cover.pageCount).toBe(1);
    expect(cover.pageSizesIn[0]).toEqual({ width: 18.75, height: 10 });

    expect((await startValidation(userId, exp.id)).ok).toBe(true);
    await drainQueue();
    expect((await db.bookExport.findUniqueOrThrow({ where: { id: exp.id } })).validationStatus).toBe("passed");
  }, 180_000);

  it("pads softcovers to Lulu's 32-page minimum and sizes the cover for it", async () => {
    const exp = await exportAndRead("softcover-square-8.5");
    expect(exp.pageCount).toBe(32);
    expect(exp.preflightOk).toBe(true);
    expect((exp.coverDims as { spineIn: number }).spineIn).toBeCloseTo(32 / 444 + 0.06, 3);
  }, 180_000);

  it("real 300 ppi art passes the resolution check; text that doesn't fit is caught", async () => {
    const pages = await db.page.findMany({ where: { bookId, kind: "story" }, orderBy: { index: "asc" } });
    const art = await sharp({ create: { width: 2625, height: 2625, channels: 3, background: "#4477aa" } }).png().toBuffer();
    for (const p of pages) {
      const key = p.imageKey!.replace(/\.svg$/, ".png");
      await getStorage().put(key, art, "image/png");
      await db.page.update({ where: { id: p.id }, data: { imageKey: key, layout: "fullBleed" } });
    }
    await db.page.update({ where: { id: pages[2].id }, data: { text: "So many words. ".repeat(60) } });
    const exp = await exportAndRead("hardcover-square-8.5");
    const report = exp.preflight as unknown as PreflightReport;
    expect(report.items.find((i) => i.code === "resolution")?.level).toBe("pass");
    expect(report.items.some((i) => i.code === "text-fit" && i.level === "error")).toBe(true);
    expect(exp.preflightOk).toBe(false);
    expect((await startValidation(userId, exp.id)).ok).toBe(false);
  }, 180_000);

  it("won't hand a localhost link to a real printer", async () => {
    const exp = await exportAndRead("hardcover-square-8.5");
    const remote = new MockPrintProvider();
    Object.defineProperty(remote, "name", { value: "lulu" });
    resetProviders({ printRouter: new PrintRouter([remote]) });
    expect((await startValidation(userId, exp.id)).ok).toBe(true);
    await drainQueue();
    const after = await db.bookExport.findUniqueOrThrow({ where: { id: exp.id } });
    expect(after.validationStatus).toBe("failed");
    expect(after.error).toMatch(/PUBLIC_BASE_URL/);
  }, 180_000);
});
