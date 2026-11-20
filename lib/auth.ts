import { cache } from "react";
import { db } from "./db";
import { getConfig } from "./config";

/**
 * Phase 1 single-user mode: every request acts as one seeded parent account.
 * All data is still scoped by userId, so Auth.js magic-link sign-in can replace
 * this function without changing callers.
 */
export const getCurrentUser = cache(async () => {
  const email = getConfig().SINGLE_USER_EMAIL;
  return db.user.upsert({ where: { email }, update: {}, create: { email, name: "Parent" } });
});

export async function requireUser() {
  return getCurrentUser();
}
