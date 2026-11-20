import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteCustomTheme, draftCustomTheme, duplicateTheme, getOwnTheme, saveCustomTheme } from "@/lib/customThemes";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { resetProviders } from "@/lib/providers/registry";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { mockDraftTheme } from "@/lib/providers/story/mock";
import { ThemeConfigSchema } from "@/lib/schemas/theme";
import { makeUser, resetDb } from "./helpers";

describe("custom theme builder", () => {
  let userId: string;
  beforeEach(async () => {
    resetProviders();
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
  });

  it("drafts a valid original theme from a description", async () => {
    const r = await draftCustomTheme(userId, { description: "He loves rockets, planets and the moon", childAge: 4 });
    if (!r.ok) throw new Error(r.message);
    const t = await getOwnTheme(userId, r.themeId);
    expect(t?.config.genre).toBe("space");
    expect(t?.config.id).toBe(t?.slug);
    expect((await listThemesForUser(userId)).some((x) => x.id === r.themeId)).toBe(true);
  });

  it("every mock draft passes the theme schema", () => {
    for (const d of ["dinosaurs", "mermaids", "dragons", "diggers", "superheroes", "baking cookies"]) {
      expect(ThemeConfigSchema.safeParse(mockDraftTheme({ description: `loves ${d}` })).success).toBe(true);
    }
  });

  it("blocks protected names in the description and in saved fields", async () => {
    const blocked = await draftCustomTheme(userId, { description: "Make it all about Paw Patrol please" });
    expect(blocked).toMatchObject({ ok: false });
    if (!blocked.ok) expect(blocked.suggestedThemeIds).toContain("construction-crew");

    const r = await draftCustomTheme(userId, { description: "She loves the ocean and seashells" });
    if (!r.ok) throw new Error(r.message);
    const t = (await getOwnTheme(userId, r.themeId))!;
    const withPikachu = { ...t.config, supportingCast: [...t.config.supportingCast, { name: "Pikachu", role: "friend", look: "yellow" }] };
    expect(await saveCustomTheme(userId, t.id, withPikachu)).toMatchObject({ ok: false });
  });

  it("validates fields and reports them by name", async () => {
    const r = await draftCustomTheme(userId, { description: "She loves the ocean and seashells" });
    if (!r.ok) throw new Error(r.message);
    const t = (await getOwnTheme(userId, r.themeId))!;
    const bad = await saveCustomTheme(userId, t.id, { ...t.config, artDirection: { ...t.config.artDirection, palette: ["red"] } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors ?? {}).some((k) => k.startsWith("artDirection.palette"))).toBe(true);
    const good = await saveCustomTheme(userId, t.id, { ...t.config, name: "Seashell Cove" });
    expect(good.ok).toBe(true);
    expect((await getOwnTheme(userId, t.id))?.name).toBe("Seashell Cove");
  });

  it("duplicates built-in themes, protects them from edits, and blocks deleting used themes", async () => {
    const builtIn = (await listThemesForUser(userId)).find((t) => t.slug === "ocean-deep")!;
    expect(await saveCustomTheme(userId, builtIn.id, builtIn.config)).toMatchObject({ ok: false });
    const dup = await duplicateTheme(userId, builtIn.id);
    if (!dup.ok) throw new Error(dup.message);
    const child = await createChild(userId, { firstName: "Lu", age: 5, pronouns: "they", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const book = await createAndStartBook(userId, {
      childId: child.id,
      themeId: dup.themeId,
      options: { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false },
    });
    expect(book.ok).toBe(true);
    expect((await deleteCustomTheme(userId, dup.themeId)).ok).toBe(false);
    const fresh = await duplicateTheme(userId, builtIn.id);
    if (!fresh.ok) throw new Error(fresh.message);
    expect((await deleteCustomTheme(userId, fresh.themeId)).ok).toBe(true);
    expect(await db.theme.count({ where: { id: fresh.themeId } })).toBe(0);
  });
});
