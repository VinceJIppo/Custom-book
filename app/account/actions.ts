"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOptionalUser, SESSION_COOKIE } from "@/lib/auth";
import { deleteAccount } from "@/lib/accounts/deleteAccount";
import { errorMessage, log } from "@/lib/log";

/** "Delete my account": the parent types their email to confirm. */
export async function deleteAccountAction(fd: FormData) {
  // Not getCurrentUser: accounts still waiting for approval can delete themselves too.
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  const typed = String(fd.get("confirmEmail") ?? "").trim().toLowerCase();
  if (!typed || typed !== user.email.toLowerCase()) redirect("/account?error=mismatch#delete");
  let r: Awaited<ReturnType<typeof deleteAccount>>;
  try {
    r = await deleteAccount(user.id);
  } catch (err) {
    log.error("Account delete failed", { userId: user.id, err: errorMessage(err) });
    redirect("/account?error=retry#delete");
  }
  if (!r.ok) redirect(`/account?error=${r.reason}#delete`);
  (await cookies()).delete(SESSION_COOKIE);
  redirect(r.emailed ? "/goodbye?emailed=1" : "/goodbye");
}
