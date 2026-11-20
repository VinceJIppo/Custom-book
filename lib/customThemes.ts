import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ThemeConfigSchema, type ThemeConfig } from "./schemas/theme";
import { findProtectedNames } from "./safety/protectedNames";
import { getModeration, getStoryProvider } from "./providers/registry";
import { dailyUsage } from "./cost/usage";
import { getConfig } from "./config";
import { listThemesForUser } from "./themes";

/**
 * Custom Theme Builder: a parent describes what their child loves, Claude
 * drafts a complete original theme, and the parent edits and saves it.
 * Themes are reusable across books and children, and can be duplicated.
 */

export type ThemeResult = { ok: true; themeId: string } | { ok: false; message: string; errors?: Record<string, string>; suggestedThemeIds?: string[] };

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "theme"
  );
}

async function uniqueSlug(base: string, ownerId: string) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.theme.findFirst({ where: { slug, OR: [{ ownerId }, { isBuiltIn: true }] } });
    if (!clash) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Protected-name and moderation checks over every text field of a theme. */
async function checkThemeText(config: ThemeConfig): Promise<{ message: string; suggestedThemeIds?: string[] } | null> {
  const text = [
    config.name,
    config.pitch,
    config.setting,
    config.powerIdeas ?? "",
    config.artDirection.mood,
    ...config.supportingCast.flatMap((c) => [c.name, c.role, c.look]),
    ...config.storyBeats,
    ...config.contentRules,
  ].join(". ");
  const hits = findProtectedNames(text);
  if (hits.length) return { message: hits[0].message, suggestedThemeIds: hits[0].suggestedThemeIds };
  const mod = await getModeration().check(text);
  return mod.ok ? null : { message: mod.message ?? "Please keep the theme gentle and G-rated." };
}

export async function draftCustomTheme(userId: string, input: { description: string; childAge?: number }): Promise<ThemeResult> {
  const description = input.description.trim();
  if (description.length < 10) return { ok: false, message: "Tell us a little more: a sentence or two about what your child loves." };
  if (description.length > 1000) return { ok: false, message: "Please keep it under 1,000 characters." };
  const hits = findProtectedNames(description);
  if (hits.length) return { ok: false, message: hits[0].message, suggestedThemeIds: hits[0].suggestedThemeIds };
  const mod = await getModeration().check(description);
  if (!mod.ok) return { ok: false, message: mod.message ?? "Please rephrase." };
  const cap = getConfig().DAILY_COST_CAP_USD;
  if ((await dailyUsage(userId)).costUsd + 0.1 > cap) return { ok: false, message: `That would go over today's generation budget of $${cap.toFixed(2)}.` };

  const { value, usage } = await getStoryProvider().draftTheme({ description, childAge: input.childAge });
  const problem = await checkThemeText(value);
  if (problem) return { ok: false, message: "The draft didn't pass our checks. Try describing it differently.", suggestedThemeIds: problem.suggestedThemeIds };

  const slug = await uniqueSlug(value.id || value.name, userId);
  const config: ThemeConfig = { ...value, id: slug, licensed: false };
  const theme = await db.$transaction(async (tx) => {
    const t = await tx.theme.create({ data: { slug, name: config.name, config: config as unknown as Prisma.InputJsonValue, ownerId: userId, isBuiltIn: false } });
    await tx.generationJob.create({
      data: {
        type: "theme.draft",
        status: "succeeded",
        payload: { themeId: t.id },
        userId,
        attempts: 1,
        provider: usage.provider,
        costUsd: usage.costUsd,
        usage: usage as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    return t;
  });
  return { ok: true, themeId: theme.id };
}

export async function saveCustomTheme(userId: string, themeId: string, raw: unknown): Promise<ThemeResult> {
  const theme = await db.theme.findFirst({ where: { id: themeId, ownerId: userId, isBuiltIn: false } });
  if (!theme) return { ok: false, message: "You can only edit your own themes. Duplicate a built-in theme to customize it." };
  const parsed = ThemeConfigSchema.safeParse({ ...(raw as object), id: theme.slug, licensed: false });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[i.path.join(".")] ??= i.message;
    return { ok: false, message: "Please fix the highlighted fields.", errors };
  }
  const problem = await checkThemeText(parsed.data);
  if (problem) return { ok: false, message: problem.message, suggestedThemeIds: problem.suggestedThemeIds };
  await db.theme.update({ where: { id: theme.id }, data: { name: parsed.data.name, config: parsed.data as unknown as Prisma.InputJsonValue } });
  return { ok: true, themeId: theme.id };
}

export async function duplicateTheme(userId: string, themeId: string): Promise<ThemeResult> {
  const source = (await listThemesForUser(userId)).find((t) => t.id === themeId);
  if (!source || source.config.licensed) return { ok: false, message: "That theme can't be duplicated." };
  const name = `${source.config.name} (my version)`.slice(0, 60);
  const slug = await uniqueSlug(`${source.slug}-copy`, userId);
  const config: ThemeConfig = { ...source.config, id: slug, name, licensed: false };
  const t = await db.theme.create({ data: { slug, name, config: config as unknown as Prisma.InputJsonValue, ownerId: userId, isBuiltIn: false } });
  return { ok: true, themeId: t.id };
}

export async function deleteCustomTheme(userId: string, themeId: string): Promise<{ ok: boolean; message?: string }> {
  const theme = await db.theme.findFirst({ where: { id: themeId, ownerId: userId, isBuiltIn: false }, include: { _count: { select: { books: true } } } });
  if (!theme) return { ok: false, message: "Theme not found." };
  if (theme._count.books > 0) return { ok: false, message: "Books use this theme, so it can't be deleted. Books keep their own copy, so editing it is safe." };
  await db.theme.delete({ where: { id: theme.id } });
  return { ok: true };
}

export async function getOwnTheme(userId: string, themeId: string) {
  const t = await db.theme.findFirst({ where: { id: themeId, ownerId: userId, isBuiltIn: false } });
  if (!t) return null;
  const parsed = ThemeConfigSchema.safeParse(t.config);
  return parsed.success ? { ...t, config: parsed.data } : null;
}
