import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { explainFailure, getBookProgress } from "@/lib/books/progress";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { makeUser, resetDb } from "./helpers";

describe("why a book stopped", () => {
  it("turns common provider errors into advice", () => {
    expect(explainFailure("Gemini HTTP 429: RESOURCE_EXHAUSTED")).toMatch(/WORKER_CONCURRENCY=1/);
    expect(explainFailure("Your prepay credit balance is depleted")).toMatch(/aistudio.google.com\/billing/);
    expect(explainFailure("HTTP 403 API key not valid")).toMatch(/API key was refused/);
    expect(explainFailure("fetch failed")).toMatch(/busy or unreachable/);
    expect(explainFailure("something odd")).toMatch(/Try again/);
  });

  describe("on the book page", () => {
    let bookId: string;
    beforeEach(async () => {
      resetProviders();
      await resetDb();
      await syncBuiltInThemes(true);
      const userId = (await makeUser()).id;
      const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "ocean-deep")!.id;
      const child = await createChild(userId, { firstName: "Ana", age: 5, pronouns: "she", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
      if (!child.ok) throw new Error("child");
      const r = await createAndStartBook(userId, { childId: child.id, themeId, options: { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false } });
      if (!r.ok) throw new Error(r.message);
      bookId = r.bookId;
      await db.generationJob.createMany({
        data: [1, 2, 3].map(() => ({ type: "page.illustrate", status: "failed", payload: {}, userId, bookId, error: "Gemini request failed (HTTP 429): RESOURCE_EXHAUSTED quota exceeded" })),
      });
    });
    it("groups failures with a hint, only when asked (admins)", async () => {
      expect((await getBookProgress(bookId, 12)).problems).toBeUndefined();
      const p = await getBookProgress(bookId, 12, { withProblems: true });
      expect(p.problems).toHaveLength(1);
      expect(p.problems![0]).toMatchObject({ count: 3, hint: expect.stringMatching(/Too many requests/) });
    });
  });
});
