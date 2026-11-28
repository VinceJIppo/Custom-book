"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOptionalUser, SESSION_COOKIE } from "@/lib/auth";
import { deleteAccount } from "@/lib/accounts/deleteAccount";

/** "Delete my account": the parent types their email to confirm. */
export async function deleteAccountAction(fd: FormData) {
  // Not getCurrentUser: accounts still waiting for approval can delete themselves too.
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  const typed = String(fd.get("confirmEmail") ?? "").trim().toLowerCase();
  if (!typed || typed !== user.email.toLowerCase()) redirect("/account?error=mismatch#delete");
  const r = await deleteAccount(user.id);
  if (!r.ok) redirect(`/account?error=${r.reason}#delete`);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/goodbye");
}
