/**
 * Email magic-link sign-in. No passwords.
 *
 * - A link holds a random 256-bit token; the DB stores only its SHA-256 hash.
 * - Links last 15 minutes and work once.
 * - The link opens a page with a "Sign in" button (a POST), because email
 *   scanners often open links automatically and would otherwise use them up.
 * - Asking for a link always looks the same whether or not the email has an
 *   account, so nobody can probe for accounts. At most 5 links per email per hour.
 * - Sessions: a random token in an httpOnly cookie; the DB stores its hash.
 */
import { initialApproval, notifyAdminsOfRequest } from "../accounts/approval";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { getConfig } from "../config";
import { getEmailProvider } from "../providers/registry";
import { errorMessage, log } from "../log";

export const LINK_MINUTES = 15;
const MAX_LINKS_PER_HOUR = 5;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export function normalizeEmail(input: unknown): string | null {
  const r = EmailSchema.safeParse(input);
  return r.success ? r.data : null;
}

export type LinkResult = { ok: true; devLink?: string } | { ok: false; message: string };

/** Emails a sign-in link. Returns the link itself only for the offline mock in development. */
export async function requestSignInLink(rawEmail: unknown): Promise<LinkResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, message: "Enter a valid email address." };
  const recent = await db.loginToken.count({ where: { email, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_LINKS_PER_HOUR) return { ok: false, message: "We've sent several links already. Check your inbox (and spam folder), or try again in an hour." };

  const token = newToken();
  await db.loginToken.create({ data: { email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) } });
  const cfg = getConfig();
  const link = `${cfg.APP_URL.replace(/\/$/, "")}/signin/verify?email=${encodeURIComponent(email)}&token=${token}`;
  const email$ = getEmailProvider();
  try {
    await email$.send({
      to: email,
      subject: "Your StoryStar sign-in link",
      text: `Hello!\n\nClick this link to sign in to StoryStar:\n${link}\n\nIt works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<p>Hello!</p><p><a href="${link}" style="display:inline-block;background:#2a63c9;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to StoryStar</a></p><p>The link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`,
      idempotencyKey: hashToken(token).slice(0, 40),
    });
  } catch (err) {
    log.error("Sign-in email failed", { err: errorMessage(err) });
    return { ok: false, message: "We couldn't send the email just now. Please try again in a minute." };
  }
  const devLink = email$.name === "mock" && cfg.NODE_ENV !== "production" ? link : undefined;
  return { ok: true, devLink };
}

/**
 * Uses a link: checks it, marks it used (once, even if clicked twice at the
 * same moment), finds or creates the account, and starts a session.
 * Returns the session token for the cookie.
 */
export async function redeemSignInLink(rawEmail: unknown, token: string): Promise<{ ok: true; sessionToken: string; userId: string; expiresAt: Date } | { ok: false; message: string }> {
  const email = normalizeEmail(rawEmail);
  const expired = { ok: false as const, message: "This sign-in link has expired or was already used. Ask for a new one below." };
  if (!email || !token) return expired;
  const row = await db.loginToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.email !== email || row.usedAt || row.expiresAt < new Date()) return expired;
  const claimed = await db.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return expired;

  const user = await db.user.upsert({ where: { email }, update: {}, create: { email, approval: initialApproval(email) } });
  // New accounts that need approval: tell the admins (once).
  if (user.approval === "pending") await notifyAdminsOfRequest(user);
  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + getConfig().SESSION_DAYS * 86400_000);
  await db.session.create({ data: { tokenHash: hashToken(sessionToken), userId: user.id, expiresAt } });
  // Tidy up: old links for this email are no longer needed.
  await db.loginToken.deleteMany({ where: { email, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }] } });
  return { ok: true, sessionToken, userId: user.id, expiresAt };
}

export async function userForSession(sessionToken: string | undefined | null) {
  if (!sessionToken) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hashToken(sessionToken) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  // Note activity at most once an hour.
  if (Date.now() - s.lastSeenAt.getTime() > 3600_000) await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return s.user;
}

export async function endSession(sessionToken: string | undefined | null) {
  if (sessionToken) await db.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
}
