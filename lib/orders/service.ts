/**
 * Print orders: quote, checkout, send to the printer after payment, and keep
 * the status up to date. The flow:
 *
 *   shippingQuotes -> startCheckout (order "awaiting_payment", PDFs frozen)
 *   -> customer pays -> fulfillCheckout (webhook or return page; runs once)
 *   -> "paid" + order.submit job -> print job created ("created")
 *   -> webhooks / polling -> in_production, shipped, delivered (or rejected)
 *
 * Prices are always recalculated on the server; nothing the browser sends
 * about money is trusted.
 */
import { getCredits, redeemForOrder, reverseOrderCredits, rewardForOrder } from "../credits";
import { handleCreditPurchaseEvent } from "../credits/purchase";
import type { Order, Prisma } from "@prisma/client";
import { db } from "../db";
import { getConfig } from "../config";
import { log, errorMessage } from "../log";
import { enqueue } from "../jobs/queue";
import { getStorage, keys } from "../storage";
import { getPaymentProvider, getPrintRouter } from "../providers/registry";
import type { PaymentEvent } from "../providers/payment/types";
import { WebhookSignatureError, type PrintOrderState, type ShippingAddress, type ShippingLevel, SHIPPING_LEVELS } from "../providers/print/types";
import { buildBookView } from "../books/view";
import { isAdminEmail } from "../admin";
import { notifyOrderStatus } from "./notify";
import { GiftNoteSchema, parseAddress } from "./address";
import { formatMoney, priceQuote, type CustomerQuote } from "./pricing";
import { OPEN_PRINT_STATUSES, pushHistory, shouldApply, STATUS_LABELS, type OrderStatus } from "./status";

export type Result<T> = ({ ok: true } & T) | { ok: false; message: string; errors?: Record<string, string> };

function pricingConfig() {
  const c = getConfig();
  // The account credit charge only applies when the order really comes with credits.
  const credit = c.CREDITS_ENABLED && c.CREDIT_PER_BOOK_USD > 0 ? c.ORDER_CREDIT_CHARGE_USD : 0;
  return { marginPercent: c.ORDER_MARGIN_PERCENT, marginFlatUsd: c.ORDER_MARGIN_FLAT_USD, coverCardFees: c.ORDER_COVER_CARD_FEES, creditChargeUsd: credit };
}

/** Print files that can be ordered: rendered, preflight passed, and made from the book as it is now. */
export async function orderableExports(userId: string, bookId: string) {
  const book = await db.book.findFirst({ where: { id: bookId, userId }, include: { pages: true } });
  if (!book) return { book: null, exports: [] };
  const currentKey = book.pages.length ? (await buildBookView(book)).contentKey : "";
  const exports = await db.bookExport.findMany({ where: { bookId, userId, status: "ready", preflightOk: true }, orderBy: { createdAt: "desc" } });
  const router = getPrintRouter();
  const products = await router.allProducts();
  return {
    book,
    exports: exports
      .filter((e) => e.contentKey === currentKey && e.validationStatus !== "failed")
      .map((e) => ({ export: e, product: products.find((p) => p.id === e.productId) }))
      .filter((x): x is { export: typeof x.export; product: NonNullable<typeof x.product> } => !!x.product),
  };
}

async function loadOrderable(userId: string, bookId: string, exportId: string) {
  const { book, exports } = await orderableExports(userId, bookId);
  if (!book) return { error: "Book not found." } as const;
  const found = exports.find((x) => x.export.id === exportId);
  if (!found) return { error: "Those print files are out of date or didn't pass the checks. Make new print files first." } as const;
  if (!found.export.pageCount || !found.export.interiorKey || !found.export.coverKey) return { error: "The print files are incomplete. Make new print files." } as const;
  return { book, exp: found.export, product: found.product } as const;
}

export interface ShippingQuote extends CustomerQuote {
  label?: string;
}

/** One price per shipping speed for this book and address (what the customer sees). */
export async function shippingQuotes(
  userId: string,
  input: { bookId: string; exportId: string; address: unknown },
): Promise<Result<{ quotes: CustomerQuote[]; bookTitle: string; address: ShippingAddress; warnings: string[]; suggestion?: Partial<ShippingAddress> }>> {
  const parsed = parseAddress(input.address);
  if (!parsed.ok) return { ok: false, message: "Please check the address.", errors: parsed.errors };
  const o = await loadOrderable(userId, input.bookId, input.exportId);
  if ("error" in o) return { ok: false, message: o.error! };
  const { provider, product } = await getPrintRouter().choose(o.product.id, parsed.address);
  try {
    const options = await provider.shippingOptions(product, o.exp.pageCount!, parsed.address);
    if (!options.length) return { ok: false, message: "The printer doesn't ship to this address. Check the country and postcode." };
    const quotes = await Promise.all(
      options.map(async (opt) => priceQuote(await provider.quote(product, o.exp.pageCount!, parsed.address, opt.level), pricingConfig(), { min: opt.arrivalMin, max: opt.arrivalMax })),
    );
    quotes.sort((a, b) => a.totalCents - b.totalCents);
    const first = quotes[0]?.printer;
    return {
      ok: true,
      quotes,
      bookTitle: o.book.title ?? "Your book",
      address: parsed.address,
      warnings: first?.addressWarnings?.map((w) => w.message) ?? [],
      suggestion: first?.suggestedAddress,
    };
  } catch (err) {
    log.warn("Shipping quote failed", { err: errorMessage(err) });
    return { ok: false, message: `The printer couldn't price this address: ${friendly(err)}` };
  }
}

function friendly(err: unknown) {
  const m = errorMessage(err);
  // Provider errors can be long JSON; keep the start.
  return m.length > 300 ? `${m.slice(0, 300)}...` : m;
}

async function freezeFiles(order: { id: string; userId: string }, book: { id: string; childId: string }, exp: { interiorKey: string | null; coverKey: string | null }, attempt: number) {
  const storage = getStorage();
  const out: { interiorPdfKey: string; coverPdfKey: string } = {
    interiorPdfKey: keys.orderFile(order.userId, book.childId, book.id, order.id, "interior", attempt),
    coverPdfKey: keys.orderFile(order.userId, book.childId, book.id, order.id, "cover", attempt),
  };
  for (const [from, to] of [
    [exp.interiorKey, out.interiorPdfKey],
    [exp.coverKey, out.coverPdfKey],
  ] as const) {
    const obj = from ? await storage.get(from) : null;
    if (!obj) throw new Error("The print files are missing. Make new print files.");
    await storage.put(to, obj.data, "application/pdf");
  }
  return out;
}

async function deleteFrozen(order: Pick<Order, "interiorPdfKey" | "coverPdfKey">) {
  const storage = getStorage();
  for (const k of [order.interiorPdfKey, order.coverPdfKey]) if (k) await storage.delete(k).catch(() => undefined);
}

/**
 * Creates the order at a freshly calculated price, freezes a copy of the PDFs,
 * and opens a checkout. Returns where to send the browser.
 */
export async function startCheckout(
  userId: string,
  input: { bookId: string; exportId: string; address: unknown; giftNote?: string; shippingLevel: string; useCredits?: boolean },
): Promise<Result<{ orderId: string; url: string }>> {
  const level = SHIPPING_LEVELS.find((l) => l === input.shippingLevel) as ShippingLevel | undefined;
  if (!level) return { ok: false, message: "Choose a shipping option." };
  const gift = GiftNoteSchema.safeParse(input.giftNote);
  if (!gift.success) return { ok: false, message: gift.error.issues[0].message, errors: { giftNote: gift.error.issues[0].message } };
  const parsed = parseAddress(input.address);
  if (!parsed.ok) return { ok: false, message: "Please check the address.", errors: parsed.errors };
  const o = await loadOrderable(userId, input.bookId, input.exportId);
  if ("error" in o) return { ok: false, message: o.error! };
  const { provider, product } = await getPrintRouter().choose(o.product.id, parsed.address);

  let quote: CustomerQuote;
  try {
    const options = await provider.shippingOptions(product, o.exp.pageCount!, parsed.address);
    const opt = options.find((x) => x.level === level);
    if (!opt) return { ok: false, message: "That shipping option isn't available for this address any more. Get new prices and choose again." };
    quote = priceQuote(await provider.quote(product, o.exp.pageCount!, parsed.address, level), pricingConfig(), { min: opt.arrivalMin, max: opt.arrivalMax });
  } catch (err) {
    return { ok: false, message: `The printer couldn't price this order: ${friendly(err)}` };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const payment = getPaymentProvider();
  // Credits toward the book, keeping CREDIT_REDEEM_KEEP_USD in the account. A card charge
  // must be at least 50 cents, so credits either cover everything or leave at least that.
  let creditCents = 0;
  if (input.useCredits) {
    const credits = await getCredits(userId);
    creditCents = Math.min(quote.totalCents, Math.floor(credits.redeemableUsd * 100));
    if (creditCents < quote.totalCents && quote.totalCents - creditCents < 50) creditCents = quote.totalCents - 50;
    creditCents = Math.max(0, creditCents);
  }
  const dueCents = quote.totalCents - creditCents;
  const order = await db.order.create({
    data: {
      userId,
      bookId: o.book.id,
      bookTitle: o.book.title ?? "Your book",
      exportId: o.exp.id,
      productId: product.id,
      productSku: product.sku,
      provider: provider.name,
      pageCount: o.exp.pageCount!,
      status: "awaiting_payment",
      statusHistory: pushHistory(null, { status: "awaiting_payment", message: "Checkout started" }) as unknown as Prisma.InputJsonValue,
      address: parsed.address as unknown as Prisma.InputJsonValue,
      giftNote: gift.data,
      shippingLevel: level,
      quote: quote as unknown as Prisma.InputJsonValue,
      currency: quote.currency,
      totalCents: quote.totalCents,
      creditCents,
      paymentProvider: dueCents === 0 ? "credits" : payment.name,
      estimatedArrival: quote.arrivalMax,
    },
  });
  try {
    const frozen = await freezeFiles(order, o.book, o.exp, 1);
    const appUrl = getConfig().APP_URL.replace(/\/$/, "");
    if (dueCents === 0) {
      // Paid entirely with credits: no card checkout.
      await db.order.update({ where: { id: order.id }, data: { ...frozen } });
      await markPaid(order.id, `credits_${order.id}`);
      return { ok: true, orderId: order.id, url: `${appUrl}/orders/${order.id}` };
    }
    const session = await payment.createCheckout({
      orderId: order.id,
      amountCents: dueCents,
      currency: quote.currency.toLowerCase(),
      productName: `${o.book.title ?? "Picture book"} (${product.label})`,
      description: `Printed picture book, ${o.exp.pageCount} pages, shipped to ${parsed.address.name}`,
      customerEmail: user.email.endsWith(".local") ? undefined : user.email,
      successUrl: `${appUrl}/orders/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/books/${o.book.id}/order?cancelled=${order.id}`,
    });
    await db.order.update({ where: { id: order.id }, data: { ...frozen, checkoutSessionId: session.id } });
    return { ok: true, orderId: order.id, url: session.url };
  } catch (err) {
    log.error("Could not start checkout", { err: errorMessage(err) });
    const fresh = await db.order.findUnique({ where: { id: order.id } });
    if (fresh) await deleteFrozen(fresh);
    await db.order.delete({ where: { id: order.id } }).catch(() => undefined);
    return { ok: false, message: `Checkout couldn't start: ${friendly(err)}` };
  }
}

/**
 * Called by the payment webhook AND the return page. Safe to call many times,
 * even at once: the move to "paid" is a conditional update, so the print job
 * is queued exactly once.
 */
export async function fulfillCheckout(sessionId: string): Promise<Order | null> {
  const order = await db.order.findUnique({ where: { checkoutSessionId: sessionId } });
  if (!order) return null;
  if (order.status !== "awaiting_payment" && order.status !== "payment_failed") return order;
  const state = await getPaymentProvider().getCheckout(sessionId);
  if (state.status === "expired" && !state.paid) return markExpired(order);
  if (!state.paid) return order;
  if (state.amountCents != null && state.amountCents !== order.totalCents - order.creditCents) {
    log.error("Paid amount differs from the order total", { orderId: order.id, paid: state.amountCents, expected: order.totalCents - order.creditCents });
  }
  return markPaid(order.id, state.paymentRef);
}

/**
 * Moves an order to "paid" exactly once: queues the print job, takes any credits
 * applied at checkout, and adds the per-book credits.
 */
async function markPaid(orderId: string, paymentRef?: string): Promise<Order | null> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  const moved = await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["awaiting_payment", "payment_failed"] } },
      data: {
        status: "paid",
        paidAt: new Date(),
        paymentRef,
        statusHistory: pushHistory(order.statusHistory, { status: "paid", message: order.creditCents ? `Payment received (${formatMoney(order.creditCents, order.currency)} in credits)` : "Payment received" }) as unknown as Prisma.InputJsonValue,
      },
    });
    if (r.count !== 1) return false;
    await enqueue("order.submit", { orderId: order.id }, { userId: order.userId, bookId: order.bookId ?? undefined, maxAttempts: 5 }, tx);
    await redeemForOrder(order.userId, order.id, order.creditCents, tx);
    await rewardForOrder(order.userId, order.id, tx);
    return true;
  });
  const fresh = await db.order.findUnique({ where: { id: order.id } });
  if (moved) {
    log.info("Order paid", { orderId: order.id });
    if (fresh) await notifyOrderStatus(fresh, "paid");
  }
  return fresh;
}

async function markExpired(order: Order) {
  const r = await db.order.updateMany({
    where: { id: order.id, status: "awaiting_payment" },
    data: { status: "expired", statusHistory: pushHistory(order.statusHistory, { status: "expired", message: "Checkout expired without payment" }) as unknown as Prisma.InputJsonValue },
  });
  if (r.count) await deleteFrozen(order);
  return db.order.findUnique({ where: { id: order.id } });
}

export async function handlePaymentEvent(event: PaymentEvent) {
  // Credit packs use the same payment provider and webhook.
  if (await db.creditPurchase.findUnique({ where: { checkoutSessionId: event.sessionId } })) return handleCreditPurchaseEvent(event);
  if (event.type === "checkout.completed") {
    const order = await fulfillCheckout(event.sessionId);
    if (!order) await warnUnmatchedPayment(event.sessionId);
    return order;
  }
  const order = await db.order.findUnique({ where: { checkoutSessionId: event.sessionId } });
  if (!order) return null;
  if (event.type === "checkout.expired") return markExpired(order);
  await db.order.updateMany({
    where: { id: order.id, status: "awaiting_payment" },
    data: { status: "payment_failed", statusHistory: pushHistory(order.statusHistory, { status: "payment_failed", message: "The payment didn't go through" }) as unknown as Prisma.InputJsonValue },
  });
  return db.order.findUnique({ where: { id: order.id } });
}

/**
 * A paid checkout that matches no order or credit pack (for example the account was deleted while a
 * bank payment was still clearing). Nothing can be fulfilled, so the money needs refunding by hand.
 */
async function warnUnmatchedPayment(sessionId: string) {
  try {
    const state = await getPaymentProvider().getCheckout(sessionId);
    if (state.paid) log.error("Payment received for an order or credit pack that no longer exists: refund it in the payment dashboard", { sessionId, paymentRef: state.paymentRef, amountCents: state.amountCents });
  } catch (err) {
    log.warn("Couldn't check an unmatched payment", { sessionId, err: errorMessage(err) });
  }
}

/** Verifies and applies a payment webhook. Throws WebhookSignatureError on a bad signature. */
export async function handlePaymentWebhook(rawBody: string, headers: Record<string, string>) {
  const event = await getPaymentProvider().parseWebhook(rawBody, headers);
  if (event) await handlePaymentEvent(event);
  return event;
}

/** Applies a printer status update to an order (from a webhook, a poll, or order creation). */
export async function applyPrintState(order: Order, state: PrintOrderState, source: string): Promise<Order> {
  if (order.providerOrderId && order.providerOrderId !== state.providerOrderId) return order;
  const data: Prisma.OrderUpdateInput = { lastCheckedAt: new Date() };
  const changes: string[] = [];
  if (state.trackingNumber && state.trackingNumber !== order.trackingNumber) data.trackingNumber = state.trackingNumber;
  if (state.trackingUrl && state.trackingUrl !== order.trackingUrl) data.trackingUrl = state.trackingUrl;
  if (state.carrier && state.carrier !== order.carrier) data.carrier = state.carrier;
  if (state.estimatedArrival && state.estimatedArrival !== order.estimatedArrival) data.estimatedArrival = state.estimatedArrival;
  if (state.providerStatus && state.providerStatus !== order.providerStatus) {
    data.providerStatus = state.providerStatus;
    changes.push(state.providerStatus);
  }
  let status = order.status;
  if (shouldApply(order.status, state.status)) {
    status = state.status;
    data.status = state.status;
  }
  const reason = state.reason ?? null;
  if (reason !== order.statusReason) data.statusReason = reason;
  if (status !== order.status || changes.length) {
    data.statusHistory = pushHistory(order.statusHistory, {
      status,
      message: [STATUS_LABELS[status as OrderStatus] ?? status, state.reason].filter(Boolean).join(". "),
      detail: state.providerStatus ? `${source}: ${state.providerStatus}` : source,
    }) as unknown as Prisma.InputJsonValue;
  }
  const updated = await db.order.update({ where: { id: order.id }, data });
  if (status !== order.status) await notifyOrderStatus(updated, status);
  return updated;
}

/** The order.submit job: hands the frozen PDFs to the printer. */
export async function submitOrder(orderId: string, attempt: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order || order.status !== "paid") return { skipped: true };
  const router = getPrintRouter();
  const provider = router.provider(order.provider);
  // A retry after a crash must not create a second print job.
  if (attempt > 1) {
    const existing = await provider.findOrderByExternalId(order.id);
    if (existing) {
      await db.order.update({ where: { id: order.id }, data: { providerOrderId: existing.providerOrderId, submittedAt: new Date() } });
      await applyPrintState({ ...order, providerOrderId: existing.providerOrderId }, existing, "found existing print job");
      return { providerOrderId: existing.providerOrderId, reused: true };
    }
  }
  if (!order.interiorPdfKey || !order.coverPdfKey) throw Object.assign(new Error("The frozen print files are missing."), { permanent: true });
  const { product } = await router.choose(order.productId);
  const cfg = getConfig();
  const storage = getStorage();
  // The printer may download the files a while after the job is created.
  const ttl = Math.max(cfg.PRINT_FILE_URL_TTL_SECONDS, 3 * 86400);
  const interiorUrl = await storage.signedUrl(order.interiorPdfKey, ttl, { absolute: true });
  const coverUrl = await storage.signedUrl(order.coverPdfKey, ttl, { absolute: true });
  const { isPrivateUrl, publicUrlHelp } = await import("../print/publicUrl");
  if (provider.name !== "mock" && isPrivateUrl(interiorUrl)) throw Object.assign(new Error(publicUrlHelp(provider.name, interiorUrl)), { permanent: true });

  const state = await provider.createOrder({
    product,
    pageCount: order.pageCount,
    interiorUrl,
    coverUrl,
    title: order.bookTitle || "Picture book",
    address: order.address as unknown as ShippingAddress,
    shippingLevel: order.shippingLevel as ShippingLevel,
    externalId: order.id,
    contactEmail: cfg.ORDER_CONTACT_EMAIL ?? order.user.email,
  });
  const updated = await db.order.update({ where: { id: order.id }, data: { providerOrderId: state.providerOrderId, submittedAt: new Date() } });
  await applyPrintState(updated, state, "print job created");
  log.info("Print job created", { orderId: order.id, provider: provider.name, providerOrderId: state.providerOrderId });
  return { providerOrderId: state.providerOrderId };
}

/** When order.submit gives up: the customer paid, so flag it loudly for the admin. */
export async function submitGaveUp(orderId: string, message: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "paid") return;
  const failed = await db.order.update({
    where: { id: orderId },
    data: { status: "failed", statusReason: message, statusHistory: pushHistory(order.statusHistory, { status: "failed", message }) as unknown as Prisma.InputJsonValue },
  });
  await notifyOrderStatus(failed, "failed");
}

/** Asks the printer for the latest status (the polling fallback, and the "Check now" button). */
export async function refreshOrderStatus(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order?.providerOrderId) return order;
  const state = await getPrintRouter().provider(order.provider).getOrderStatus(order.providerOrderId);
  return applyPrintState(order, state, "status check");
}

/** Verifies and applies a printer webhook. Throws WebhookSignatureError on a bad signature. */
export async function handlePrintWebhook(providerName: string, rawBody: string, headers: Record<string, string>) {
  let provider;
  try {
    provider = getPrintRouter().provider(providerName);
  } catch {
    throw new WebhookSignatureError(`No print provider named ${providerName}`);
  }
  const state = await provider.handleWebhook(rawBody, headers);
  if (!state) return null;
  const order = await db.order.findFirst({ where: { provider: provider.name, providerOrderId: state.providerOrderId } });
  if (!order) {
    log.warn("Webhook for an unknown print job", { provider: provider.name, providerOrderId: state.providerOrderId });
    return null;
  }
  return applyPrintState(order, state, "webhook");
}

/** Worker tick: queue a status check for open orders not checked recently. */
export async function scheduleOrderChecks(now = new Date()) {
  const cutoff = new Date(now.getTime() - getConfig().ORDER_POLL_MINUTES * 60_000);
  const due = await db.order.findMany({
    where: { status: { in: OPEN_PRINT_STATUSES }, providerOrderId: { not: null }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
    select: { id: true, userId: true, bookId: true },
    take: 50,
  });
  const pendingJobs = await db.generationJob.findMany({ where: { type: "order.status", status: { in: ["queued", "running"] } }, select: { payload: true } });
  const pending = new Set(pendingJobs.map((j) => (j.payload as { orderId?: string }).orderId));
  let queued = 0;
  for (const o of due) {
    if (pending.has(o.id)) continue;
    await enqueue("order.status", { orderId: o.id }, { userId: o.userId, bookId: o.bookId ?? undefined, maxAttempts: 2 });
    queued++;
  }
  return queued;
}

/**
 * The fix path for a rejected order: send it again with newer print files
 * (same product, no new charge). Owners and admins may do this.
 */
export async function resendOrder(userId: string, orderId: string, opts: { admin?: boolean } = {}): Promise<Result<{ orderId: string }>> {
  const order = await db.order.findFirst({ where: { id: orderId, ...(opts.admin ? {} : { userId }) }, include: { book: true } });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status !== "rejected" && order.status !== "failed" && order.status !== "cancelled") return { ok: false, message: "Only orders that need a fix can be sent again." };
  if (!order.paidAt) return { ok: false, message: "This order was never paid." };
  if (!order.book) return { ok: false, message: "The book for this order was deleted, so it can't be sent again." };
  const { exports } = await orderableExports(order.book.userId, order.book.id);
  const next = exports.find((x) => x.product.id === order.productId);
  if (!next) return { ok: false, message: "Make new print files for the same book format first (Print files page), then send it again." };
  const attempt = Array.isArray(order.statusHistory) ? (order.statusHistory as Array<{ message?: string }>).filter((h) => h.message?.startsWith("Sent again")).length + 2 : 2;
  const frozen = await freezeFiles(order, order.book, next.export, attempt);
  await deleteFrozen(order);
  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        ...frozen,
        exportId: next.export.id,
        pageCount: next.export.pageCount ?? order.pageCount,
        providerOrderId: null,
        providerStatus: null,
        statusReason: null,
        trackingNumber: null,
        trackingUrl: null,
        carrier: null,
        status: "paid",
        statusHistory: pushHistory(order.statusHistory, { status: "paid", message: "Sent again with new print files" }) as unknown as Prisma.InputJsonValue,
      },
    });
    await enqueue("order.submit", { orderId: order.id }, { userId: order.userId, bookId: order.bookId ?? undefined, maxAttempts: 5 }, tx);
  });
  return { ok: true, orderId: order.id };
}

/** Admin: refund an order that won't be printed (only before or after a failed print job). */
export async function refundOrder(orderId: string): Promise<Result<{ refundId: string }>> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, message: "Order not found." };
  if (!order.paymentRef || !order.paidAt) return { ok: false, message: "This order has no payment to refund." };
  if (!["paid", "failed", "rejected", "cancelled"].includes(order.status)) {
    return { ok: false, message: "Only orders that aren't being printed can be refunded here. Cancel the print job with the printer first." };
  }
  try {
    const r = await getPaymentProvider().refund(order.paymentRef);
    await db.order.update({
      where: { id: order.id },
      data: { status: "refunded", statusHistory: pushHistory(order.statusHistory, { status: "refunded", message: `Refunded (${r.id})` }) as unknown as Prisma.InputJsonValue },
    });
    await reverseOrderCredits(order.userId, order.id);
    const queuedJobs = await db.generationJob.findMany({ where: { type: "order.submit", status: "queued" }, select: { id: true, payload: true } });
    const ids = queuedJobs.filter((j) => (j.payload as { orderId?: string }).orderId === orderId).map((j) => j.id);
    if (ids.length) await db.generationJob.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled" } });
    return { ok: true, refundId: r.id };
  } catch (err) {
    return { ok: false, message: `The refund didn't go through: ${friendly(err)}` };
  }
}

export async function listOrders(userId: string) {
  return db.order.findMany({ where: { userId, status: { not: "expired" } }, orderBy: { createdAt: "desc" } });
}

export async function getOrder(userId: string, orderId: string, opts: { admin?: boolean } = {}) {
  return db.order.findFirst({ where: { id: orderId, ...(opts.admin ? {} : { userId }) } });
}

export function isAdmin(user: { email: string }) {
  return isAdminEmail(user.email);
}

export function quoteOf(order: Order): CustomerQuote | null {
  return (order.quote as unknown as CustomerQuote | null) ?? null;
}
