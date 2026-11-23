"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { approveAccount, declineAccount } from "@/lib/accounts/approval";

export async function decideAccountAction(fd: FormData) {
  const me = await getCurrentUser();
  const userId = String(fd.get("userId") ?? "");
  const res = fd.get("decision") === "approve" ? await approveAccount(me, userId) : await declineAccount(me, userId);
  redirect(`/admin/accounts?${res.ok ? "done=1" : `error=${encodeURIComponent(res.message)}`}`);
}
