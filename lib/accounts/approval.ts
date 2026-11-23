/**
 * Approving new accounts (NEW_ACCOUNT_APPROVAL=true). A new account is "pending"
 * until an admin approves it: it can't make anything that costs money, and gets
 * no welcome credits until then. Admins (ADMIN_EMAILS) get an email for every
 * request, and the parent gets an email when they're approved.
 */
import type { User } from "@prisma/client";
import { db } from "../db";
import { getConfig } from "../config";
import { isAdminEmail } from "../admin";
import { getEmailProvider } from "../providers/registry";
import { ensureSignupCredits } from "../credits";
import { errorMessage, log } from "../log";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const appUrl = () => getConfig().APP_URL.replace(/\/$/, "");

export function approvalRequired() {
  return getConfig().NEW_ACCOUNT_APPROVAL;
}

/** True when this account may use the app (approved, an admin, or approval is off). */
export function isApproved(user: Pick<User, "email" | "approval">) {
  return !approvalRequired() || user.approval === "approved" || isAdminEmail(user.email);
}

/** The status a brand-new account starts with. */
export function initialApproval(email: string) {
  return approvalRequired() && !isAdminEmail(email) ? "pending" : "approved";
}

function adminEmails() {
  return (getConfig().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Emails every admin about a new account waiting for approval (once per account). */
export async function notifyAdminsOfRequest(user: Pick<User, "id" | "email" | "approval" | "approvalRequestedAt">) {
  if (user.approval !== "pending" || user.approvalRequestedAt) return;
  const claimed = await db.user.updateMany({ where: { id: user.id, approvalRequestedAt: null }, data: { approvalRequestedAt: new Date() } });
  if (claimed.count !== 1) return;
  const waiting = await db.user.count({ where: { approval: "pending" } });
  const link = `${appUrl()}/admin/accounts`;
  const line = `${user.email} signed up and is waiting for approval. ${waiting} account${waiting === 1 ? " is" : "s are"} waiting in total.`;
  for (const to of adminEmails()) {
    try {
      await getEmailProvider().send({
        to,
        subject: `[StoryStar] New account to approve: ${user.email}`,
        text: `${line}\n\nApprove or decline: ${link}`,
        html: `<p>${esc(line)}</p><p><a href="${link}">Approve or decline</a></p>`,
        idempotencyKey: `approval-request-${user.id}-${to}`,
      });
    } catch (err) {
      log.warn("Approval request email failed", { userId: user.id, err: errorMessage(err) });
    }
  }
}

export type ApprovalResult = { ok: true } | { ok: false; message: string };

/** An admin approves an account: it can now make books and gets its welcome credits. */
export async function approveAccount(admin: Pick<User, "email">, userId: string): Promise<ApprovalResult> {
  if (!isAdminEmail(admin.email)) return { ok: false, message: "Only admins can approve accounts." };
  const r = await db.user.updateMany({ where: { id: userId, approval: { not: "approved" } }, data: { approval: "approved" } });
  if (r.count !== 1) return { ok: false, message: "That account is already approved or doesn't exist." };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await ensureSignupCredits(user.id);
  try {
    const line = "Good news: your StoryStar account is ready. Sign in to make your first picture book, starring your child.";
    await getEmailProvider().send({
      to: user.email,
      subject: "Your StoryStar account is ready",
      text: `${line}\n\n${appUrl()}/signin`,
      html: `<p>${esc(line)}</p><p><a href="${appUrl()}/signin">Sign in to StoryStar</a></p>`,
      idempotencyKey: `approved-${user.id}`,
    });
  } catch (err) {
    log.warn("Approval email failed", { userId, err: errorMessage(err) });
  }
  return { ok: true };
}

/** An admin declines an account. It stays signed out of everything that costs money. */
export async function declineAccount(admin: Pick<User, "email">, userId: string): Promise<ApprovalResult> {
  if (!isAdminEmail(admin.email)) return { ok: false, message: "Only admins can decline accounts." };
  const r = await db.user.updateMany({ where: { id: userId, approval: "pending" }, data: { approval: "rejected" } });
  return r.count === 1 ? { ok: true } : { ok: false, message: "That account isn't waiting for approval." };
}

export async function pendingAccounts() {
  return db.user.findMany({ where: { approval: { in: ["pending", "rejected"] } }, orderBy: { createdAt: "desc" }, take: 200 });
}
