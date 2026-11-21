import { getConfig } from "./config";

/** Admins: ADMIN_EMAILS (comma-separated), or in single-user mode the single user. */
export function isAdminEmail(email: string) {
  const c = getConfig();
  const list = (c.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list.includes(email.toLowerCase()) : email === c.SINGLE_USER_EMAIL;
}
