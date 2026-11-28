"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { TIER_IDS } from "@/lib/allowance";
import { grantCredits } from "@/lib/credits";

export async function saveRewardsAction(fd: FormData) {
  const me = await getCurrentUser();
  if (!isAdminEmail(me.email)) redirect("/");
  const tier = String(fd.get("tierOverride") ?? "");
  const n = (k: string) => Math.max(0, Math.min(500, Math.floor(Number(fd.get(k) ?? 0)) || 0));
  // updateMany: a deleted account (gone from the list) is left untouched.
  await db.user.updateMany({
    where: { id: String(fd.get("userId") ?? ""), deletedAt: null },
    data: {
      tierOverride: (TIER_IDS as readonly string[]).includes(tier) ? tier : null,
      bonusBooks: n("bonusBooks"),
      bonusCharacters: n("bonusCharacters"),
      bonusRedraws: n("bonusRedraws"),
    },
  });
  redirect("/admin/users?saved=1");
}

/** Adds credits to a customer (gifts, apologies, testing). The form's one-time key stops a double click adding twice. */
export async function addCreditsAction(fd: FormData) {
  const me = await getCurrentUser();
  if (!isAdminEmail(me.email)) redirect("/");
  const userId = String(fd.get("userId") ?? "");
  const amount = Math.round(Number(fd.get("amount") ?? 0) * 100) / 100;
  const key = String(fd.get("key") ?? "");
  if (!(amount >= 0.01 && amount <= 500) || !/^[a-z0-9-]{8,64}$/i.test(key)) redirect("/admin/users?error=amount");
  const note = String(fd.get("note") ?? "").trim().slice(0, 120) || `Added by ${me.email}`;
  const user = await db.user.findFirst({ where: { id: userId, deletedAt: null }, select: { email: true } });
  if (!user) redirect("/admin/users?error=user");
  await grantCredits(userId, amount, "admin", { sourceKey: `admin:${key}`, note });
  redirect(`/admin/users?credited=${encodeURIComponent(`$${amount.toFixed(2)} to ${user.email}`)}`);
}

/**
 * Starts an account's character count again from now: character sets made before this no longer
 * count toward its allowance or each person's "sets used" limit. Nothing is deleted.
 */
export async function resetCharactersAction(fd: FormData) {
  const me = await getCurrentUser();
  if (!isAdminEmail(me.email)) redirect("/");
  const userId = String(fd.get("userId") ?? "");
  const user = await db.user.findFirst({ where: { id: userId, deletedAt: null }, select: { email: true } });
  if (!user) redirect("/admin/users?error=user");
  await db.user.update({ where: { id: userId }, data: { characterResetAt: new Date() } });
  redirect(`/admin/users?reset=${encodeURIComponent(user.email)}`);
}
