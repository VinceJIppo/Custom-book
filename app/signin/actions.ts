"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requestSignInLink, redeemSignInLink, endSession } from "@/lib/auth/magicLink";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export interface SignInState {
  sent?: boolean;
  email?: string;
  message?: string;
  devLink?: string;
}

export async function requestLinkAction(_prev: SignInState | null, fd: FormData): Promise<SignInState> {
  const email = String(fd.get("email") ?? "");
  const r = await requestSignInLink(email);
  if (!r.ok) return { message: r.message, email };
  return { sent: true, email, devLink: r.devLink };
}

export async function verifyLinkAction(fd: FormData) {
  const r = await redeemSignInLink(String(fd.get("email") ?? ""), String(fd.get("token") ?? ""));
  if (!r.ok) redirect(`/signin?error=${encodeURIComponent(r.message)}`);
  (await cookies()).set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions(r.expiresAt));
  redirect("/");
}

export async function signOutAction() {
  const store = await cookies();
  await endSession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect("/signin?signedOut=1");
}
