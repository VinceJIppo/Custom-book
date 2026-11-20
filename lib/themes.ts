import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ThemeConfigSchema, type ThemeConfig } from "./schemas/theme";
import { BUILT_IN_THEME_FILES } from "../themes";

/** Validates every built-in theme. Throws with the file name on a bad file. */
export function loadBuiltInThemeFiles(files: Record<string, unknown> = BUILT_IN_THEME_FILES): ThemeConfig[] {
  return Object.keys(files)
    .sort()
    .map((f) => {
      const parsed = ThemeConfigSchema.safeParse(files[f]);
      if (!parsed.success) throw new Error(`Invalid theme file ${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      if (parsed.data.licensed) throw new Error(`Built-in theme ${f} must not be licensed`);
      if (`${parsed.data.id}.json` !== f) throw new Error(`Theme file ${f} must be named after its id (${parsed.data.id}.json)`);
      return parsed.data;
    });
}

let synced = false;

/** Upsert built-in themes into the DB so books can reference them. Cheap and idempotent. */
export async function syncBuiltInThemes(force = false) {
  if (synced && !force) return;
  for (const t of loadBuiltInThemeFiles()) {
    const existing = await db.theme.findFirst({ where: { slug: t.id, isBuiltIn: true } });
    const data = { name: t.name, config: t as unknown as Prisma.InputJsonValue, licensed: false };
    if (existing) await db.theme.update({ where: { id: existing.id }, data });
    else await db.theme.create({ data: { ...data, slug: t.id, isBuiltIn: true } });
  }
  synced = true;
}

export interface ThemeListing {
  id: string;
  slug: string;
  isBuiltIn: boolean;
  config: ThemeConfig;
}

/**
 * Themes a user may pick: built-ins, their own custom themes, and licensed
 * themes only when they have a current License record.
 */
export async function listThemesForUser(userId: string): Promise<ThemeListing[]> {
  await syncBuiltInThemes();
  const now = new Date();
  const rows = await db.theme.findMany({
    where: { OR: [{ isBuiltIn: true }, { ownerId: userId }] },
    include: { license: true },
    orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }],
  });
  return rows
    .filter((r) => !r.licensed || (r.license && (!r.license.expiresAt || r.license.expiresAt > now)))
    .flatMap((r) => {
      const parsed = ThemeConfigSchema.safeParse(r.config);
      return parsed.success ? [{ id: r.id, slug: r.slug, isBuiltIn: r.isBuiltIn, config: parsed.data }] : [];
    });
}

export async function getThemeForUser(themeId: string, userId: string) {
  const all = await listThemesForUser(userId);
  return all.find((t) => t.id === themeId) ?? null;
}
