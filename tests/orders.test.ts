import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createChild, deleteChildEverything } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { drainQueue } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { getPaymentProvider, resetProviders } from "@/lib/providers/registry";
import { PrintRouter } from "@/lib/providers/print/router";
import { MockPrintProvider, MOCK_WEBHOOK_SECRET } from "@/lib/providers/print/mock";
import { MockPaymentProvider, MOCK_PAYMENT_WEBHOOK_SECRET } from "@/lib/providers/payment/mock";
import { WebhookSignatureError } from "@/lib/providers/print/types";
import {
  fulfillCheckout,
  handlePaymentWebhook,
  handlePrintWebhook,
  orderableExports,
  refreshOrderStatus,
  refundOrder,
  resendOrder,
  scheduleOrderChecks,
  shippingQuotes,
  startCheckout,
} from "@/lib/orders/service";
import { resetConfigCache } from "@/lib/config";
import { makeUser, resetDb } from "./helpers";

const address = { name: "Grandma Rose", street1: "12 Elm Street", city: "Springfield", stateCode: "IL", postcode: "62704", countryCode: "US", phone: "217-555-0100" };
const sign = (body: string, secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

describe("print orders (mock printer and mock checkout)", () => {
  let userId: string;
  let bookId: string;
  let childId: string;
  let exportId: string;

  beforeEach(async () => {
    resetProviders({ printRouter: new PrintRouter([new MockPrintProvider(60)]), payment: new MockPaymentProvider() });
    await resetDb();
    await syncBuiltInThemes(true);
    userId = (await makeUser()).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "space-explorer")!.id;
    const child = await createChild(userId, { firstName: "Oliver", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    childId = child.id;
    const res = await createAndStartBook(userId, { childId, themeId, options: { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false } });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
    await drainQueue();
    // Ready, preflight-passed print files for the book as it is now (rendering itself is covered in pdf-export.test.ts).
    const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
    const view = await buildBookView(book);
    const storage = getStorage();
    const exp = await db.bookExport.create({
      data: { bookId, userId, productId: "hardcover-square-8.5", provider: "mock", sku: "0850X0850.FC.PRE.CW.080CW444.GXX", status: "ready", pageCount: 24, preflightOk: true, contentKey: view.contentKey },
    });
    const interiorKey = `users/${userId}/children/${childId}/books/${bookId}/exports/${exp.id}-interior.pdf`;
    const coverKey = `users/${userId}/children/${childId}/books/${bookId}/exports/${exp.id}-cover.pdf`;
    await storage.put(interiorKey, Buffer.from("%PDF-interior"), "application/pdf");
    await storage.put(coverKey, Buffer.from("%PDF-cover"), "application/pdf");
    await db.bookExport.update({ where: { id: exp.id }, data: { interiorKey, coverKey } });
    exportId = exp.id;
  });
  afterEach(() => {
    vi.useRealTimers();
    resetProviders();
  });

  async function paidOrder(addr = address) {
    const start = await startCheckout(userId, { bookId, exportId, address: addr, shippingLevel: "GROUND", giftNote: "Happy birthday!" });
    if (!start.ok) throw new Error(start.message);
    const order = await db.order.findUniqueOrThrow({ where: { id: start.orderId } });
    (getPaymentProvider() as MockPaymentProvider).pay(order.checkoutSessionId!);
    return { start, order };
  }

  it("quotes one total per shipping speed, cheapest first", async () => {
    const r = await shippingQuotes(userId, { bookId, exportId, address });
    if (!r.ok) throw new Error(r.message);
    expect(r.quotes.map((q) => q.shippingLevel)).toEqual(["MAIL", "GROUND", "EXPEDITED", "EXPRESS"]);
    expect(r.quotes[0].totalCents).toBeLessThan(r.quotes[3].totalCents);
    // The card fee is covered by default, so the customer pays a bit more than the printer charges.
    expect(r.quotes[0].totalCents).toBeGreaterThan(Math.round(r.quotes[0].printer.total * 100));
    const bad = await shippingQuotes(userId, { bookId, exportId, address: { ...address, postcode: "" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors?.postcode).toMatch(/ZIP/);
  });

  it("only orders files that passed preflight and match the book as it is now", async () => {
    expect((await orderableExports(userId, bookId)).exports).toHaveLength(1);
    await db.page.updateMany({ where: { bookId, kind: "story", storyNumber: 1 }, data: { text: "A brand new first line." } });
    expect((await orderableExports(userId, bookId)).exports).toHaveLength(0);
    const r = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/out of date/);
  });

  it("checkout -> paid exactly once -> print job created, with a frozen copy of the PDFs", async () => {
    const start = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "GROUND", giftNote: "Happy birthday!" });
    if (!start.ok) throw new Error(start.message);
    expect(start.url).toMatch(/^\/checkout\/mock\/mock_cs_/);
    let order = await db.order.findUniqueOrThrow({ where: { id: start.orderId } });
    expect(order).toMatchObject({ status: "awaiting_payment", shippingLevel: "GROUND", giftNote: "Happy birthday!", pageCount: 24, provider: "mock" });
    const storage = getStorage();
    expect((await storage.get(order.interiorPdfKey!))?.data.toString()).toBe("%PDF-interior");
    expect(order.interiorPdfKey).toContain(`/orders/${order.id}-1-interior.pdf`);

    // Not paid yet: nothing happens.
    expect((await fulfillCheckout(order.checkoutSessionId!))?.status).toBe("awaiting_payment");
    (getPaymentProvider() as MockPaymentProvider).pay(order.checkoutSessionId!);
    // The return page and the webhook race; only one print job may be queued.
    await Promise.all([fulfillCheckout(order.checkoutSessionId!), fulfillCheckout(order.checkoutSessionId!), fulfillCheckout(order.checkoutSessionId!)]);
    expect(await db.generationJob.count({ where: { type: "order.submit" } })).toBe(1);
    order = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(order.status).toBe("paid");
    expect(order.paymentRef).toMatch(/^mock_pi_/);

    await drainQueue();
    order = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(order.status).toBe("created");
    expect(order.providerOrderId).toMatch(/^mock-o-/);
    expect(order.providerStatus).toBe("PRODUCTION_DELAYED");
    expect((order.statusHistory as Array<{ status: string }>).map((h) => h.status)).toEqual(["awaiting_payment", "paid", "created"]);
  });

  it("status moves forward by polling and webhooks, with tracking", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { order } = await paidOrder();
    await fulfillCheckout(order.checkoutSessionId!);
    await drainQueue();
    let o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("created");

    // Polling fallback: the worker queues checks for open orders not checked recently.
    vi.setSystemTime(Date.now() + 90_000);
    process.env.ORDER_POLL_MINUTES = "1";
    resetConfigCache();
    try {
      expect(await scheduleOrderChecks()).toBe(1);
      expect(await scheduleOrderChecks()).toBe(0); // already queued
      await drainQueue();
    } finally {
      delete process.env.ORDER_POLL_MINUTES;
      resetConfigCache();
    }
    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("in_production");

    // Webhook (signed) two steps later: shipped with tracking.
    vi.setSystemTime(Date.now() + 60_000);
    const body = JSON.stringify({ providerOrderId: o.providerOrderId });
    await handlePrintWebhook("mock", body, { "x-mock-signature": sign(body, MOCK_WEBHOOK_SECRET) });
    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o).toMatchObject({ status: "shipped", carrier: "Test Carrier" });
    expect(o.trackingUrl).toMatch(/^https:\/\/example.com\/track\//);

    // A bad signature changes nothing.
    await expect(handlePrintWebhook("mock", body, { "x-mock-signature": "nope" })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(handlePrintWebhook("nonexistent", body, {})).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("payment webhooks: completed pays the order, expired cleans it up, bad signatures are refused", async () => {
    const a = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL" });
    const b = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL" });
    if (!a.ok || !b.ok) throw new Error("checkout");
    const oa = await db.order.findUniqueOrThrow({ where: { id: a.orderId } });
    const ob = await db.order.findUniqueOrThrow({ where: { id: b.orderId } });
    (getPaymentProvider() as MockPaymentProvider).pay(oa.checkoutSessionId!);
    const paidBody = JSON.stringify({ type: "checkout.completed", sessionId: oa.checkoutSessionId });
    await handlePaymentWebhook(paidBody, { "x-mock-signature": sign(paidBody, MOCK_PAYMENT_WEBHOOK_SECRET) });
    expect((await db.order.findUniqueOrThrow({ where: { id: oa.id } })).status).toBe("paid");

    const expiredBody = JSON.stringify({ type: "checkout.expired", sessionId: ob.checkoutSessionId });
    await expect(handlePaymentWebhook(expiredBody, { "x-mock-signature": "bad" })).rejects.toBeInstanceOf(WebhookSignatureError);
    expect((await db.order.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe("awaiting_payment");
    await handlePaymentWebhook(expiredBody, { "x-mock-signature": sign(expiredBody, MOCK_PAYMENT_WEBHOOK_SECRET) });
    expect((await db.order.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe("expired");
    expect(await getStorage().exists(ob.interiorPdfKey!)).toBe(false);
  });

  it("rejected by the printer -> fix path: send again with new files, no new charge", async () => {
    const { order } = await paidOrder({ ...address, name: "Reject Test" });
    await fulfillCheckout(order.checkoutSessionId!);
    await drainQueue();
    let o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("rejected");
    expect(o.statusReason).toMatch(/Make new print files/);

    const r = await resendOrder(userId, o.id);
    expect(r.ok).toBe(true);
    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o).toMatchObject({ status: "paid", providerOrderId: null });
    expect(o.interiorPdfKey).toContain(`-2-interior.pdf`);
    expect(await db.generationJob.count({ where: { type: "order.submit", status: "queued" } })).toBe(1);
    expect(o.paidAt).not.toBeNull();
    // Someone else can't resend it.
    const stranger = await makeUser("someone@else.test");
    expect((await resendOrder(stranger.id, o.id)).ok).toBe(false);
  });

  it("an order the printer never got can be refunded", async () => {
    const { order } = await paidOrder();
    await fulfillCheckout(order.checkoutSessionId!);
    await db.order.update({ where: { id: order.id }, data: { status: "failed", statusReason: "Printer down" } });
    const r = await refundOrder(order.id);
    expect(r.ok).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("refunded");
    expect(await db.generationJob.count({ where: { type: "order.submit", status: "queued" } })).toBe(0);
    expect((await refundOrder(order.id)).ok).toBe(false);
  });

  it("deleting the child keeps paid orders as records but removes the book link and the PDFs", async () => {
    const { order } = await paidOrder();
    await fulfillCheckout(order.checkoutSessionId!);
    await drainQueue();
    const unpaid = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL" });
    if (!unpaid.ok) throw new Error(unpaid.message);
    const before = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    const res = await deleteChildEverything(userId, childId);
    expect(res.ok).toBe(true);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ bookId: null, status: "created", bookTitle: before.bookTitle });
    expect(await getStorage().exists(before.interiorPdfKey!)).toBe(false);
    expect(await db.order.findUnique({ where: { id: unpaid.orderId } })).toBeNull();
    expect((await refreshOrderStatus(order.id))?.status).toBe("created");
  });

  it("never trusts a price or speed from the browser", async () => {
    const r = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "TELEPORT" });
    expect(r.ok).toBe(false);
    const ok = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "EXPRESS", ...({ totalCents: 1 } as object) });
    if (!ok.ok) throw new Error(ok.message);
    const q = await shippingQuotes(userId, { bookId, exportId, address });
    if (!q.ok) throw new Error(q.message);
    const o = await db.order.findUniqueOrThrow({ where: { id: ok.orderId } });
    expect(o.totalCents).toBe(q.quotes.find((x) => x.shippingLevel === "EXPRESS")!.totalCents);
  });
});
