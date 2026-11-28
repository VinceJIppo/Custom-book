/**
 * "Delete my account", done by the parent themselves.
 *
 * What goes: every child and grown-up with all their photos, characters, books,
 * pages and print files (in storage and in the database), custom themes, credits,
 * unfinished checkouts, sessions and sign-in links, and the email address.
 *
 * What stays, with no email or name attached: records of paid print orders
 * (title, shipping address, amounts, status) and paid credit packs, for our
 * accounts; and a one-way hash of the email plus usage counts, so a new account
 * with the same address doesn't get the welcome credits or free trial again.
 *
 * An account can't be deleted while one of its print orders is still being
 * printed, shipped or fixed: the printer and the order emails still need it.
 */
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getStorage } from "../storage";
import { getPaymentProvider, getEmailProvider } from "../providers/registry";
import { errorMessage, log } from "../log";
import { lifetimeUsage } from "../allowance";
import { enqueue } from "../jobs/queue";
import { fulfillCheckout } from "../orders/service";
import { fulfillCreditPurchase } from "../credits/purchase";
import { STATUS_LABELS, type OrderStatus } from "../orders/status";
import { deletedEmailFor, deletedEmailHash } from "./deleted";

/** Order statuses that mean the printer (or we) still have work to do on it. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["paid", "created", "in_production", "shipped", "rejected", "failed"];

/** Unpaid order statuses: the order is simply removed. */
const UNPAID_ORDER_STATUSES = ["awaiting_payment", "payment_failed", "expired"];

/** Everything under this folder in storage belongs to the account. */
export const userPrefix = (userId: string) => `users/${userId}/`;

export interface DeletionBlocker {
  orderId: string;
  title: string;
  status: string;
}

/** Print orders that still need the account. Empty means the account can be deleted. */
export async function deletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const orders = await db.order.findMany({ where: { userId, status: { in: OPEN_ORDER_STATUSES } }, orderBy: { createdAt: "desc" }, select: { id: true, bookTitle: true, status: true } });
  return orders.map((o) => ({ orderId: o.id, title: o.bookTitle || "Your book", status: STATUS_LABELS[o.status as OrderStatus] ?? o.status }));
}

export type DeleteAccountResult =
  | { ok: true; files: number }
  | { ok: false; reason: "not_found" | "open_orders" | "payment_went_through" | "payment_service"; message: string };

/**
 * Closes every unpaid checkout so nothing can be paid after the account is gone.
 * If one turns out to be paid already, it's recorded (as a paid order or credits)
 * and the caller stops: the parent should see it before deleting.
 */
async function closeOpenCheckouts(userId: string): Promise<"closed" | "paid"> {
  const payment = getPaymentProvider();
  const [orders, packs] = await Promise.all([
    db.order.findMany({ where: { userId, status: { in: ["awaiting_payment", "payment_failed"] }, checkoutSessionId: { not: null } }, select: { checkoutSessionId: true } }),
    db.creditPurchase.findMany({ where: { userId, status: "awaiting_payment", checkoutSessionId: { not: null } }, select: { checkoutSessionId: true } }),
  ]);
  let paid = false;
  for (const { checkoutSessionId } of orders) {
    const id = checkoutSessionId!;
    await payment.expireCheckout(id);
    if ((await payment.getCheckout(id)).paid) {
      paid = true;
      await fulfillCheckout(id);
    }
  }
  for (const { checkoutSessionId } of packs) {
    const id = checkoutSessionId!;
    await payment.expireCheckout(id);
    if ((await payment.getCheckout(id)).paid) {
      paid = true;
      await fulfillCreditPurchase(id);
    }
  }
  return paid ? "paid" : "closed";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A short "your account is deleted" note to the old address. Best effort. */
async function sendGoodbye(email: string, userId: string) {
  if (email.endsWith(".local")) return;
  const lines = [
    "Your StoryStar account has been deleted, as you asked.",
    "We've erased your children's and grown-ups' photos, characters, books and pages, and your sign-in details. If you had paid for printed books, we keep a record of those orders (title, shipping address and amount) for our accounts, with no email attached.",
    "If you didn't delete your account, reply to this email and tell us straight away.",
  ];
  try {
    await getEmailProvider().send({
      to: email,
      subject: "Your StoryStar account has been deleted",
      text: lines.join("\n\n"),
      html: lines.map((l) => `<p>${esc(l)}</p>`).join(""),
      idempotencyKey: `account-deleted-${userId}`,
    });
  } catch (err) {
    log.warn("Account deleted email failed", { userId, err: errorMessage(err) });
  }
}

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return { ok: false, reason: "not_found", message: "This account was not found. It may already be deleted." };

  if ((await deletionBlockers(userId)).length) {
    return { ok: false, reason: "open_orders", message: "A printed book is still on its way, so your account can't be deleted yet. You can delete it once the order is delivered." };
  }

  try {
    if ((await closeOpenCheckouts(userId)) === "paid") {
      return { ok: false, reason: "payment_went_through", message: "A payment you started has just gone through, so nothing was deleted. Check your orders and credits, then try again." };
    }
  } catch (err) {
    log.error("Couldn't close checkouts before deleting an account", { userId, err: errorMessage(err) });
    return { ok: false, reason: "payment_service", message: "We couldn't reach the payment service to cancel an unfinished checkout, so nothing was deleted. Please try again in a few minutes." };
  }
  // A paid checkout above could have opened an order; check again.
  if ((await deletionBlockers(userId)).length) {
    return { ok: false, reason: "open_orders", message: "A printed book is still on its way, so your account can't be deleted yet. You can delete it once the order is delivered." };
  }

  const email = user.email;
  const usage = await lifetimeUsage(userId);

  // Stop work in progress so nothing new is drawn or written for this account.
  await db.generationJob.updateMany({ where: { userId, status: { in: ["queued", "running"] } }, data: { status: "cancelled" } });

  // Files first: if storage fails, nothing in the database has changed and the parent can try again.
  const files = await getStorage().deletePrefix(userPrefix(userId));

  await db.$transaction(async (tx) => {
    // Unpaid orders go. Paid ones stay as records: their book link clears when the book goes,
    // and the gift note and frozen print files (deleted above) are dropped.
    await tx.order.deleteMany({ where: { userId, paidAt: null, status: { in: UNPAID_ORDER_STATUSES } } });
    await tx.order.updateMany({ where: { userId }, data: { giftNote: null, interiorPdfKey: null, coverPdfKey: null } });
    // Children and grown-ups: photos, characters, books, pages, versions, print files and their jobs cascade.
    await tx.childProfile.deleteMany({ where: { userId } });
    await tx.book.deleteMany({ where: { userId } });
    // Custom themes. One still used by a book elsewhere (shouldn't happen) is kept but no longer linked to the account.
    await tx.theme.deleteMany({ where: { ownerId: userId, isBuiltIn: false, books: { none: {} } } });
    await tx.theme.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
    await tx.generationJob.deleteMany({ where: { userId } });
    // Credits: the balance and its history go; paid credit packs stay as payment records.
    await tx.creditEntry.deleteMany({ where: { userId } });
    await tx.creditLot.deleteMany({ where: { userId } });
    await tx.creditPurchase.deleteMany({ where: { userId, paidAt: null } });
    // Signed out everywhere; unused sign-in links are void.
    await tx.session.deleteMany({ where: { userId } });
    await tx.loginToken.deleteMany({ where: { email } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: deletedEmailFor(userId),
        name: null,
        ageConfirmedAt: null,
        approvalRequestedAt: null,
        tierOverride: null,
        bonusBooks: 0,
        bonusCharacters: 0,
        bonusRedraws: 0,
        deletedAt: new Date(),
        deletedEmailHash: deletedEmailHash(email),
        deletedUsage: usage as unknown as Prisma.InputJsonValue,
      },
    });
  });

  // A job that was already running can still write a picture after this point; sweep the folder again later.
  for (const minutes of [30, 24 * 60]) {
    await enqueue("account.sweep", { userId }, { userId, runAfter: new Date(Date.now() + minutes * 60_000), maxAttempts: 5 });
  }
  log.info("Account deleted", { userId, files });
  await sendGoodbye(email, userId);
  return { ok: true, files };
}

/** The account.sweep job: removes anything a job still running at deletion time wrote afterwards. */
export async function sweepDeletedAccount(userId: string, jobId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
  if (!user?.deletedAt) return { skipped: true };
  const files = await getStorage().deletePrefix(userPrefix(userId));
  await db.$transaction([
    db.childProfile.deleteMany({ where: { userId } }),
    db.book.deleteMany({ where: { userId } }),
    db.creditEntry.deleteMany({ where: { userId } }),
    db.creditLot.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.generationJob.deleteMany({ where: { userId, id: { not: jobId }, type: { not: "account.sweep" } } }),
  ]);
  return { files };
}
