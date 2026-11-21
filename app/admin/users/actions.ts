"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { TIER_IDS } from "@/lib/allowance";

export async function saveRewardsAction(fd: FormData) {
  const me = await getCurrentUser();
  if (!isAdminEmail(me.email)) redirect("/");
  const tier = String(fd.get("tierOverride") ?? "");
  const n = (k: string) => Math.max(0, Math.min(500, Math.floor(Number(fd.get(k) ?? 0)) || 0));
  await db.user.update({
    where: { id: String(fd.get("userId") ?? "") },
    data: {
      tierOverride: (TIER_IDS as readonly string[]).includes(tier) ? tier : null,
      bonusBooks: n("bonusBooks"),
      bonusCharacters: n("bonusCharacters"),
      bonusRedraws: n("bonusRedraws"),
    },
  });
  redirect("/admin/users?saved=1");
}
