import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getConfig } from "./config";
import { userForSession } from "./auth/magicLink";

export const SESSION_COOKIE = "storystar_session";

/** "email" (magic-link sign-in) or "single" (no sign-in; your own computer only). */
export function authMode(): "single" | "email" {
  const c = getConfig();
  if (c.AUTH_MODE !== "auto") return c.AUTH_MODE;
  return c.NODE_ENV === "production" ? "email" : "single";
}

/** The signed-in parent, or null. */
export const getOptionalUser = cache(async () => {
  if (authMode() === "single") {
    const email = getConfig().SINGLE_USER_EMAIL;
    return db.user.upsert({ where: { email }, update: {}, create: { email, name: "Parent" } });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForSession(token);
});

/**
 * The signed-in parent. Everything is scoped by this user's id. Without a
 * session (email mode) the visitor is sent to the sign-in page.
 */
export const getCurrentUser = cache(async () => {
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  return user;
});

export async function requireUser() {
  return getCurrentUser();
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getConfig().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  };
}
