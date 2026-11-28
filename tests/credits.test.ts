import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createChild } from "@/lib/children/service";
import { createAndStartBook } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { drainQueue } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { listThemesForUser, syncBuiltInThemes } from "@/lib/themes";
import { getPaymentProvider, resetProviders } from "@/lib/providers/registry";
import { PrintRouter } from "@/lib/providers/print/router";
import { MockPrintProvider } from "@/lib/providers/print/mock";
import { MockPaymentProvider } from "@/lib/providers/payment/mock";
import { MockEmailProvider } from "@/lib/providers/email/mock";
import { MockImageProvider } from "@/lib/providers/image/mock";
import { MockUpscaler } from "@/lib/providers/upscale/mock";
import { MockStoryProvider } from "@/lib/providers/story/mock";
import { MockModerationProvider } from "@/lib/providers/moderation/mock";
import { fulfillCheckout, handlePaymentEvent, refundOrder, startCheckout } from "@/lib/orders/service";
import { chargeUsage, creditProblem, ensureSignupCredits, getCredits, grantCredits } from "@/lib/credits";
import { fulfillCreditPurchase, startCreditPurchase } from "@/lib/credits/purchase";
import { checkAllowance } from "@/lib/allowance";
import { moderate } from "@/lib/safety/moderate";
import { resetConfigCache } from "@/lib/config";
import type { IllustrationRequest } from "@/lib/providers/image/types";
import { makeUser, resetDb } from "./helpers";

const address = { name: "Grandma Rose", street1: "12 Elm Street", city: "Springfield", stateCode: "IL", postcode: "62704", countryCode: "US", phone: "217-555-0100" };
const options = { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigCache();
}

const balance = async (userId: string) => (await getCredits(userId)).balanceUsd;

describe("usage credits", () => {
  let userId: string;
  beforeEach(async () => {
    setEnv({ CREDITS_ENABLED: "true", ADMIN_EMAILS: "boss@example.com", ALLOWANCES_ENABLED: "true" });
    resetProviders({ printRouter: new PrintRouter([new MockPrintProvider(60)]), payment: new MockPaymentProvider(), email: new MockEmailProvider() });
    await resetDb();
    userId = (await makeUser("parent@example.com")).id;
  });
  afterEach(() => {
    setEnv({ CREDITS_ENABLED: "false", ADMIN_EMAILS: undefined, ALLOWANCES_ENABLED: "false" });
    resetProviders();
  });

  it("every account starts with $5, once", async () => {
    expect(await balance(userId)).toBe(5);
    await ensureSignupCredits(userId);
    await Promise.all([ensureSignupCredits(userId), getCredits(userId)]);
    expect(await balance(userId)).toBe(5);
    expect(await db.creditLot.count({ where: { userId } })).toBe(1);
  });

  it("charges actual costs from the credits that expire first, runs into a deficit, and the next grant pays it off", async () => {
    await getCredits(userId); // $5 welcome credits
    await grantCredits(userId, 10, "admin", { note: "test" });
    const lots = await db.creditLot.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    // Make the $10 lot expire sooner than the $5 one.
    await db.creditLot.update({ where: { id: lots[1].id }, data: { expiresAt: new Date(Date.now() + 86400_000) } });
    await chargeUsage(userId, 3.25, { note: "page.illustrate" });
    expect((await db.creditLot.findUniqueOrThrow({ where: { id: lots[1].id } })).remainingUsd).toBeCloseTo(6.75, 6);
    expect((await db.creditLot.findUniqueOrThrow({ where: { id: lots[0].id } })).remainingUsd).toBe(5);
    await chargeUsage(userId, 13, { note: "book.pages" });
    expect(await balance(userId)).toBeCloseTo(-1.25, 6);
    expect(await creditProblem(userId, 0.5)).toMatch(/out of credits/);
    await grantCredits(userId, 5, "purchase");
    expect(await balance(userId)).toBeCloseTo(3.75, 6);
  });

  it("expired credits drop out of the balance and show in the history", async () => {
    await getCredits(userId);
    await db.creditLot.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const c = await getCredits(userId);
    expect(c.balanceUsd).toBe(0);
    expect(await db.creditEntry.count({ where: { userId, kind: "expire" } })).toBe(1);
    await getCredits(userId);
    expect(await db.creditEntry.count({ where: { userId, kind: "expire" } })).toBe(1);
  });

  it("blocks new work the balance can't cover, but never blocks admins", async () => {
    expect(await creditProblem(userId, 4)).toBeNull();
    expect(await creditProblem(userId, 6)).toMatch(/needs about \$6\.00 of credits and you have \$5\.00/);
    const admin = (await makeUser("boss@example.com")).id;
    await chargeUsage(admin, 50, { note: "x" });
    expect(await creditProblem(admin, 10)).toBeNull();
  });

  it("with credits on, books, redraws and rewrites aren't counted against the tier; characters still are", async () => {
    expect(await checkAllowance(userId, "book", 5)).toBeNull();
    expect(await checkAllowance(userId, "redraw", 100)).toBeNull();
    expect(await checkAllowance(userId, "character", 100)).not.toBeNull();
  });

  it("making a book charges every API call, including failed tries and moderation", async () => {
    await syncBuiltInThemes(true);
    const image = new MockImageProvider();
    const draw = image.generateIllustration.bind(image);
    let n = 0;
    image.generateIllustration = async (req: IllustrationRequest) => {
      const r = await draw(req);
      // The 3rd picture fails once after being drawn (the provider still billed it).
      if (++n === 3) throw Object.assign(new Error("network dropped"), { usage: { provider: "fake", costUsd: 0.05, imageCalls: 1 } });
      return { ...r, usage: { provider: "fake", costUsd: 0.05, imageCalls: 1 } };
    };
    const moderation = new MockModerationProvider();
    moderation.check = async () => ({ ok: true, categories: [], usage: { provider: "anthropic", costUsd: 0.002 } });
    resetProviders({ image, upscaler: new MockUpscaler(), story: new MockStoryProvider(), moderation });
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "space-explorer")!.id;
    const child = await createChild(userId, { firstName: "Oliver", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    const res = await createAndStartBook(userId, { childId: child.id, themeId, options: { ...options, instructions: "Grandma's garden" } });
    if (!res.ok) throw new Error(res.message);
    for (let i = 0; i < 3; i++) {
      await drainQueue();
      await db.generationJob.updateMany({ where: { status: "queued" }, data: { runAfter: new Date(0) } });
    }
    const jobs = await db.generationJob.findMany({ where: { userId } });
    const spent = jobs.reduce((s, j) => s + j.costUsd, 0);
    const modCalls = jobs.filter((j) => j.type === "moderation.check").length;
    expect(modCalls).toBeGreaterThanOrEqual(1);
    expect(spent).toBeCloseTo(13 * 0.05 + 0.05 + modCalls * 0.002, 6); // 13 pictures, 1 failed try, the moderation calls
    expect(await balance(userId)).toBeCloseTo(5 - spent, 6);
    const usage = await db.creditEntry.findMany({ where: { userId, kind: "usage" } });
    expect(usage.some((u) => u.note?.includes("failed try"))).toBe(true);
    expect(usage.filter((u) => u.bookId === res.bookId).length).toBeGreaterThanOrEqual(14);
    // Moderation called directly is charged too.
    await moderate("a gentle note", { userId });
    expect(await db.generationJob.count({ where: { userId, type: "moderation.check" } })).toBe(modCalls + 1);
  });

  describe("orders and purchases", () => {
    let bookId: string;
    let exportId: string;
    beforeEach(async () => {
      await syncBuiltInThemes(true);
      const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "space-explorer")!.id;
      const child = await createChild(userId, { firstName: "Oliver", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
      if (!child.ok) throw new Error("child");
      const res = await createAndStartBook(userId, { childId: child.id, themeId, options });
      if (!res.ok) throw new Error(res.message);
      bookId = res.bookId;
      await drainQueue();
      const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
      const view = await buildBookView(book);
      const exp = await db.bookExport.create({
        data: { bookId, userId, productId: "hardcover-square-8.5", provider: "mock", sku: "0850X0850.FC.PRE.CW.080CW444.GXX", status: "ready", pageCount: 24, preflightOk: true, contentKey: view.contentKey },
      });
      const base = `users/${userId}/children/${child.id}/books/${bookId}/exports/${exp.id}`;
      await getStorage().put(`${base}-interior.pdf`, Buffer.from("%PDF-i"), "application/pdf");
      await getStorage().put(`${base}-cover.pdf`, Buffer.from("%PDF-c"), "application/pdf");
      await db.bookExport.update({ where: { id: exp.id }, data: { interiorKey: `${base}-interior.pdf`, coverKey: `${base}-cover.pdf` } });
      exportId = exp.id;
    });

    it("a paid book adds $5, and credits pay toward it keeping $5 in the account", async () => {
      await grantCredits(userId, 15, "admin"); // $20 in total
      const start = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL", useCredits: true });
      if (!start.ok) throw new Error(start.message);
      const order = await db.order.findUniqueOrThrow({ where: { id: start.orderId } });
      expect(order.creditCents).toBe(1500);
      const payment = getPaymentProvider() as MockPaymentProvider;
      expect(payment.session(order.checkoutSessionId!)?.amountCents).toBe(order.totalCents - 1500);
      // Credits aren't taken until the payment goes through.
      expect(await balance(userId)).toBe(20);
      payment.pay(order.checkoutSessionId!);
      await fulfillCheckout(order.checkoutSessionId!);
      await fulfillCheckout(order.checkoutSessionId!);
      expect(await balance(userId)).toBe(10); // 20 - 15 used + 5 for buying a book
      // Refund: credits come back, and the unspent book reward is removed.
      const refund = await refundOrder(order.id);
      expect(refund.ok).toBe(true);
      expect(await balance(userId)).toBe(20);
    });

    it("credits that cover the whole order skip the card checkout", async () => {
      await grantCredits(userId, 500, "admin");
      const start = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL", useCredits: true });
      if (!start.ok) throw new Error(start.message);
      const order = await db.order.findUniqueOrThrow({ where: { id: start.orderId } });
      expect(order).toMatchObject({ status: "paid", paymentProvider: "credits", checkoutSessionId: null });
      expect(order.creditCents).toBe(order.totalCents);
      expect(await balance(userId)).toBeCloseTo(505 - order.totalCents / 100 + 5, 6);
    });

    it("with $5 or less, nothing can be used at checkout, and the order still earns $5", async () => {
      const start = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL", useCredits: true });
      if (!start.ok) throw new Error(start.message);
      const order = await db.order.findUniqueOrThrow({ where: { id: start.orderId } });
      expect(order.creditCents).toBe(0);
      (getPaymentProvider() as MockPaymentProvider).pay(order.checkoutSessionId!);
      await handlePaymentEvent({ type: "checkout.completed", sessionId: order.checkoutSessionId! });
      expect(await balance(userId)).toBe(10); // $5 for signing up + $5 for buying a book
    });

    it("buying a credit pack adds it once, by return page or webhook", async () => {
      expect((await startCreditPurchase(userId, 7)).ok).toBe(false); // not a pack
      const r = await startCreditPurchase(userId, 10);
      if (!r.ok) throw new Error(r.message);
      const purchase = await db.creditPurchase.findFirstOrThrow({ where: { userId } });
      expect(r.url).toBe(`/checkout/mock/${purchase.checkoutSessionId}`);
      // Not paid yet: nothing added.
      await fulfillCreditPurchase(purchase.checkoutSessionId!);
      expect(await balance(userId)).toBe(5);
      (getPaymentProvider() as MockPaymentProvider).pay(purchase.checkoutSessionId!);
      await Promise.all([fulfillCreditPurchase(purchase.checkoutSessionId!), handlePaymentEvent({ type: "checkout.completed", sessionId: purchase.checkoutSessionId! })]);
      expect(await balance(userId)).toBe(15);
      expect((await db.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("paid");
    });
  });
});
