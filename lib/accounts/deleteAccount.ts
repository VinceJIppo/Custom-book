/**
 * "Delete my account", done by the parent themselves.
 *
 * What goes: every child and grown-up with all their photos, characters, books,
 * pages and print files (in storage and in the database), overnight picture
 * batches still waiting at the image provider, custom themes, credits,
 * unfinished checkouts, sessions and sign-in links, and the email address.
 *
 * What stays, with no email or phone attached: records of paid print orders
 * (book title, recipient's name and shipping address, amounts, status) and paid
 * credit packs, for our accounts; and a one-way hash of the email plus counts of
 * what the account made, so a new account with the same address doesn't get the
 * welcome credits or free trial again.
 *
 * An account can't be deleted while one of its print orders is unfinished (the
 * printer and the order emails still need it), or while a payment is still
 * being processed by the bank.
 */
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getStorage } from "../storage";
import { getPaymentProvider, getEmailProvider } from "../providers/registry";
import { errorMessage, log } from "../log";
import { lifetimeUsage } from "../allowance";
import { enqueue } from "../jobs/queue";
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
  status: OrderStatus;
  label: string;
}

/** Print orders that still need the account. Empty means the account can be deleted. */
export async function deletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const orders = await db.order.findMany({ where: { userId, status: { in: OPEN_ORDER_STATUSES } }, orderBy: { createdAt: "desc" }, select: { id: true, bookTitle: true, status: true } });
  return orders.map((o) => ({ orderId: o.id, title: o.bookTitle || "Your book", status: o.status as OrderStatus, label: STATUS_LABELS[o.status as OrderStatus] ?? o.status }));
}

export type DeleteAccountFailure = "not_found" | "open_orders" | "payment_went_through" | "payment_processing" | "payment_service" | "retry";
export type DeleteAccountResult = { ok: true; files: number; emailed: boolean } | { ok: false; reason: DeleteAccountFailure; message: string };

const MESSAGES: Record<DeleteAccountFailure, string> = {
  not_found: "This account was not found. It may already be deleted.",
  open_orders: "One of your print orders isn't finished yet, so your account can't be deleted yet.",
  payment_went_through: "A payment you started has just gone through, so nothing was deleted. Check your orders and credits, then try again.",
  payment_processing: "A payment you started is still being processed by your bank, so nothing was deleted. You can delete your account once it clears.",
  payment_service: "We couldn't reach the payment service to cancel an unfinished checkout, so nothing was deleted. Please try again in a few minutes.",
  retry: "A checkout was started while we were deleting, so we stopped. Please try again.",
};

/** Thrown inside the delete when a checkout appears after the claim; the delete is undone and the parent retries. */
class CheckoutStartedDuringDelete extends Error {}
const fail = (reason: DeleteAccountFailure): DeleteAccountResult => ({ ok: false, reason, message: MESSAGES[reason] });

/**
 * Closes every unfinished checkout so nothing can be paid after the account is gone.
 * - "paid": one went through; it's recorded (as a paid order or credits) and the caller stops.
 * - "processing": a bank payment is still clearing (complete but not yet paid); the caller stops.
 * Checkouts made with a payment service no longer in use can't be paid through us, so they're left to be deleted.
 */
async function closeOpenCheckouts(userId: string): Promise<"closed" | "paid" | "processing"> {
  const payment = getPaymentProvider();
  const [orders, packs] = await Promise.all([
    db.order.findMany({ where: { userId, status: { in: ["awaiting_payment", "payment_failed"] }, checkoutSessionId: { not: null } }, select: { checkoutSessionId: true, paymentProvider: true } }),
    db.creditPurchase.findMany({ where: { userId, status: "awaiting_payment", checkoutSessionId: { not: null } }, select: { checkoutSessionId: true, paymentProvider: true } }),
  ]);
  const sessions = [...orders.map((o) => ({ id: o.checkoutSessionId!, provider: o.paymentProvider, kind: "order" as const })), ...packs.map((p) => ({ id: p.checkoutSessionId!, provider: p.paymentProvider, kind: "pack" as const }))];
  let paid = false;
  let processing = false;
  for (const s of sessions) {
    if (s.provider !== payment.name) continue;
    let state = await payment.getCheckout(s.id);
    if (state.status === "open" && !state.paid) {
      await payment.expireCheckout(s.id);
      state = await payment.getCheckout(s.id);
    }
    if (state.paid) {
      paid = true;
      if (s.kind === "order") await (await import("../orders/service")).fulfillCheckout(s.id);
      else await (await import("../credits/purchase")).fulfillCreditPurchase(s.id);
    } else if (state.status !== "expired") {
      processing = true;
    }
  }
  return paid ? "paid" : processing ? "processing" : "closed";
}

/** Closes checkouts, mapping the outcome (or a payment-service failure) to a reason to stop. */
async function checkoutsBlock(userId: string): Promise<DeleteAccountFailure | null> {
  try {
    const r = await closeOpenCheckouts(userId);
    return r === "paid" ? "payment_went_through" : r === "processing" ? "payment_processing" : null;
  } catch (err) {
    log.error("Couldn't close checkouts before deleting an account", { userId, err: errorMessage(err) });
    return "payment_service";
  }
}

/** A kept order's address without the email and phone (the record only needs where it went). */
function withoutContact(address: Prisma.JsonValue): Prisma.InputJsonValue | undefined {
  if (!address || typeof address !== "object" || Array.isArray(address)) return undefined;
  const rest = { ...(address as Prisma.JsonObject) };
  delete rest.email;
  delete rest.phone;
  return rest as Prisma.InputJsonValue;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A short "your account is deleted" note to the old address. Best effort; says whether it went. */
async function sendGoodbye(email: string, userId: string): Promise<boolean> {
  if (email.endsWith(".local")) return false;
  const lines = [
    "Your StoryStar account has been deleted, as you asked.",
    "We've erased your children's and grown-ups' photos, characters, books and pages, your credits and your sign-in details. If you paid for printed books or credits, we keep a record of those payments (for an order: the book title, shipping address and amount) for our accounts, with no email or phone attached.",
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
    return true;
  } catch (err) {
    log.warn("Account deleted email failed", { userId, err: errorMessage(err) });
    return false;
  }
}

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return fail("not_found");
  if ((await deletionBlockers(userId)).length) return fail("open_orders");

  // First pass over unfinished checkouts, while the account is untouched.
  const early = await checkoutsBlock(userId);
  if (early) return fail(early);

  // Claim the delete. From here every session of this account stops working (sign-in refuses
  // deleted accounts), so no new checkout, book or theme can be started, and a second click finds nothing.
  const claimedAt = new Date();
  const claimed = await db.user.updateMany({ where: { id: userId, deletedAt: null }, data: { deletedAt: claimedAt } });
  if (claimed.count !== 1) return fail("not_found");
  const release = () => db.user.updateMany({ where: { id: userId, deletedAt: claimedAt }, data: { deletedAt: null } });

  let files: number;
  try {
    // Second pass: anything started in the moments before the claim.
    const late = (await checkoutsBlock(userId)) ?? ((await deletionBlockers(userId)).length ? "open_orders" : null);
    if (late) {
      await release();
      return fail(late);
    }
    const usage = await lifetimeUsage(userId);
    // Stop work in progress: overnight batches at the image provider, then queued and running jobs.
    const { cancelProviderBatches } = await import("../jobs/handlers/batch");
    await cancelProviderBatches({ userId });
    await db.generationJob.updateMany({ where: { userId, status: { in: ["queued", "running"] } }, data: { status: "cancelled" } });
    // Files before rows: if storage fails, the parent can simply try again.
    files = await getStorage().deletePrefix(userPrefix(userId));

    await db.$transaction(
      async (tx) => {
        // A request that was already past sign-in when the delete was claimed could still have opened a checkout.
        const opened = (await tx.order.count({ where: { userId, paidAt: null, createdAt: { gte: claimedAt } } })) + (await tx.creditPurchase.count({ where: { userId, paidAt: null, createdAt: { gte: claimedAt } } }));
        if (opened) throw new CheckoutStartedDuringDelete();
        // Jobs first, so the cascades below have nothing left to look up.
        await tx.generationJob.deleteMany({ where: { userId } });
        // Two later sweeps remove anything a job that was already running writes after this.
        for (const minutes of [30, 24 * 60]) {
          await enqueue("account.sweep", { userId }, { userId, runAfter: new Date(Date.now() + minutes * 60_000), maxAttempts: 5 }, tx);
        }
        // Unpaid orders go. Paid ones stay as records: their book link clears when the book goes,
        // and the gift note, contact details and frozen print files (deleted above) are dropped.
        await tx.order.deleteMany({ where: { userId, paidAt: null, status: { in: UNPAID_ORDER_STATUSES } } });
        for (const o of await tx.order.findMany({ where: { userId }, select: { id: true, address: true } })) {
          await tx.order.update({ where: { id: o.id }, data: { giftNote: null, interiorPdfKey: null, coverPdfKey: null, address: withoutContact(o.address) } });
        }
        // Children and grown-ups: photos, characters, books, pages, versions and print files cascade.
        await tx.childProfile.deleteMany({ where: { userId } });
        await tx.book.deleteMany({ where: { userId } });
        // Custom themes. One still used by a book elsewhere (shouldn't happen) is kept but no longer linked to the account.
        await tx.theme.deleteMany({ where: { ownerId: userId, isBuiltIn: false, books: { none: {} } } });
        await tx.theme.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
        // Credits: the balance and its history go; paid credit packs stay as payment records.
        await tx.creditEntry.deleteMany({ where: { userId } });
        await tx.creditLot.deleteMany({ where: { userId } });
        await tx.creditPurchase.deleteMany({ where: { userId, paidAt: null } });
        // Signed out everywhere; unused sign-in links are void.
        await tx.session.deleteMany({ where: { userId } });
        await tx.loginToken.deleteMany({ where: { email: user.email } });
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
            deletedAt: claimedAt,
            deletedEmailHash: deletedEmailHash(user.email),
            deletedUsage: usage as unknown as Prisma.InputJsonValue,
          },
        });
      },
      // A big account means many rows; the default 5 s isn't enough.
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (err) {
    // The account works again and the parent can retry (files already removed stay removed).
    await release().catch(() => undefined);
    if (err instanceof CheckoutStartedDuringDelete) return fail("retry");
    throw err;
  }

  log.info("Account deleted", { userId, files });
  const emailed = await sendGoodbye(user.email, userId);
  return { ok: true, files, emailed };
}

/** The account.sweep job: removes anything a job still running at deletion time wrote afterwards. */
export async function sweepDeletedAccount(userId: string, jobId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { deletedAt: true, email: true } });
  if (!user?.deletedAt || !user.email.endsWith(".invalid")) return { skipped: true };
  const files = await getStorage().deletePrefix(userPrefix(userId));
  await db.$transaction([
    db.childProfile.deleteMany({ where: { userId } }),
    db.book.deleteMany({ where: { userId } }),
    db.theme.deleteMany({ where: { ownerId: userId, isBuiltIn: false, books: { none: {} } } }),
    db.order.deleteMany({ where: { userId, paidAt: null, status: { in: UNPAID_ORDER_STATUSES } } }),
    db.creditPurchase.deleteMany({ where: { userId, paidAt: null } }),
    db.creditEntry.deleteMany({ where: { userId } }),
    db.creditLot.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.generationJob.deleteMany({ where: { userId, id: { not: jobId }, type: { not: "account.sweep" } } }),
  ]);
  return { files };
}
