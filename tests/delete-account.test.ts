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
import { startCheckout } from "@/lib/orders/service";
import { getCredits, grantCredits } from "@/lib/credits";
import { startCreditPurchase } from "@/lib/credits/purchase";
import { getAllowance } from "@/lib/allowance";
import { hashToken, normalizeEmail, userForSession } from "@/lib/auth/magicLink";
import { deleteAccount, deletionBlockers, sweepDeletedAccount, userPrefix } from "@/lib/accounts/deleteAccount";
import { deletedEmailFor, deletedEmailHash, isDeletedEmail } from "@/lib/accounts/deleted";
import { resetConfigCache } from "@/lib/config";
import { makeUser, resetDb } from "./helpers";

const address = { name: "Grandma Rose", street1: "12 Elm Street", city: "Springfield", stateCode: "IL", postcode: "62704", countryCode: "US", phone: "217-555-0100" };
const EMAIL = "parent@example.com";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigCache();
}

describe("deleting an account", () => {
  let userId: string;
  let childId: string;
  let bookId: string;
  let exportId: string;
  let email: MockEmailProvider;

  beforeEach(async () => {
    setEnv({ CREDITS_ENABLED: "true", ALLOWANCES_ENABLED: "true" });
    email = new MockEmailProvider();
    resetProviders({ printRouter: new PrintRouter([new MockPrintProvider(60)]), payment: new MockPaymentProvider(), email });
    await resetDb();
    await db.session.deleteMany();
    await db.loginToken.deleteMany();
    await syncBuiltInThemes(true);
    userId = (await makeUser(EMAIL)).id;
    const themeId = (await listThemesForUser(userId)).find((t) => t.slug === "space-explorer")!.id;
    const child = await createChild(userId, { firstName: "Oliver", age: 5, pronouns: "he", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] });
    if (!child.ok) throw new Error("child");
    childId = child.id;
    const res = await createAndStartBook(userId, { childId, themeId, options: { length: 12, readingLevel: "4-6", style: "crayon", trimSize: "square-8.5", includePet: false, includeFriend: false } });
    if (!res.ok) throw new Error(res.message);
    bookId = res.bookId;
    await drainQueue();
    // Print files, so a checkout can start.
    const book = await db.book.findUniqueOrThrow({ where: { id: bookId }, include: { pages: true } });
    const view = await buildBookView(book);
    const exp = await db.bookExport.create({
      data: { bookId, userId, productId: "hardcover-square-8.5", provider: "mock", sku: "0850X0850.FC.PRE.CW.080CW444.GXX", status: "ready", pageCount: 24, preflightOk: true, contentKey: view.contentKey },
    });
    const interiorKey = `${userPrefix(userId)}children/${childId}/books/${bookId}/exports/${exp.id}-interior.pdf`;
    const coverKey = `${userPrefix(userId)}children/${childId}/books/${bookId}/exports/${exp.id}-cover.pdf`;
    await getStorage().put(interiorKey, Buffer.from("%PDF-interior"), "application/pdf");
    await getStorage().put(coverKey, Buffer.from("%PDF-cover"), "application/pdf");
    await db.bookExport.update({ where: { id: exp.id }, data: { interiorKey, coverKey } });
    exportId = exp.id;
  });
  afterEach(() => {
    setEnv({ CREDITS_ENABLED: "false", ALLOWANCES_ENABLED: "false" });
    resetProviders();
  });

  /** A finished (delivered) paid order, as a record. */
  async function deliveredOrder() {
    return db.order.create({
      data: { userId, bookId, bookTitle: "Oliver and the Lost Little Star", provider: "mock", status: "delivered", paidAt: new Date(), totalCents: 3000, address, giftNote: "Happy birthday!", interiorPdfKey: `${userPrefix(userId)}children/${childId}/books/${bookId}/orders/x-1-interior.pdf` },
    });
  }

  it("erases everything about the account and keeps paid records without the email", async () => {
    const storage = getStorage();
    const page = await db.page.findFirstOrThrow({ where: { bookId, imageKey: { not: null } } });
    expect(await storage.exists(page.imageKey!)).toBe(true);
    const paid = await deliveredOrder();
    const unpaid = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL" });
    if (!unpaid.ok) throw new Error(unpaid.message);
    const unpaidOrder = await db.order.findUniqueOrThrow({ where: { id: unpaid.orderId } });
    const pack = await startCreditPurchase(userId, 10);
    if (!pack.ok) throw new Error(pack.message);
    const packSession = (await db.creditPurchase.findFirstOrThrow({ where: { userId, status: "awaiting_payment" } })).checkoutSessionId!;
    const paidPack = await db.creditPurchase.create({ data: { userId, amountUsd: 20, priceCents: 2000, status: "paid", paymentProvider: "mock", paidAt: new Date(), paymentRef: "mock_pi_1" } });
    await grantCredits(userId, 3, "admin", { sourceKey: "admin:test", note: "gift" });
    const theme = await db.theme.create({ data: { slug: "bees", name: "Buzzy Garden", config: {}, ownerId: userId } });
    await db.session.create({ data: { tokenHash: hashToken("session-token"), userId, expiresAt: new Date(Date.now() + 86400_000) } });
    await db.loginToken.create({ data: { email: EMAIL, tokenHash: hashToken("link-token"), expiresAt: new Date(Date.now() + 600_000) } });

    const r = await deleteAccount(userId);
    expect(r.ok).toBe(true);

    // Files: nothing left in the account's folder.
    expect(await storage.exists(page.imageKey!)).toBe(false);
    expect(await storage.deletePrefix(userPrefix(userId))).toBe(0);
    // Data: gone.
    expect(await db.childProfile.count({ where: { userId } })).toBe(0);
    expect(await db.book.count({ where: { userId } })).toBe(0);
    expect(await db.page.count({ where: { bookId } })).toBe(0);
    expect(await db.bookExport.count({ where: { userId } })).toBe(0);
    expect(await db.theme.findUnique({ where: { id: theme.id } })).toBeNull();
    expect(await db.creditLot.count({ where: { userId } })).toBe(0);
    expect(await db.creditEntry.count({ where: { userId } })).toBe(0);
    expect(await db.session.count({ where: { userId } })).toBe(0);
    expect(await db.loginToken.count({ where: { email: EMAIL } })).toBe(0);
    expect(await db.order.findUnique({ where: { id: unpaidOrder.id } })).toBeNull();
    expect(await db.creditPurchase.count({ where: { userId, status: "awaiting_payment" } })).toBe(0);
    // The open checkouts can no longer be paid.
    const payment = getPaymentProvider() as MockPaymentProvider;
    expect(payment.pay(unpaidOrder.checkoutSessionId!)).toBeNull();
    expect(payment.pay(packSession)).toBeNull();
    // Records: paid order and paid pack stay, with no book link, gift note or print files.
    const kept = await db.order.findUniqueOrThrow({ where: { id: paid.id } });
    expect(kept).toMatchObject({ bookId: null, giftNote: null, interiorPdfKey: null, status: "delivered", bookTitle: "Oliver and the Lost Little Star", totalCents: 3000 });
    expect(await db.creditPurchase.findUnique({ where: { id: paidPack.id } })).not.toBeNull();
    // The account row only holds those records now.
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(deletedEmailFor(userId));
    expect(user).toMatchObject({ name: null, ageConfirmedAt: null, deletedEmailHash: deletedEmailHash(EMAIL) });
    expect(user.deletedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(user)).not.toContain(EMAIL);
    expect((user.deletedUsage as { book: number }).book).toBe(1);
    // A goodbye note to the old address, and two later sweeps queued.
    expect(email.lastTo(EMAIL)?.subject).toMatch(/deleted/);
    expect(await db.generationJob.count({ where: { userId, type: "account.sweep", status: "queued" } })).toBe(2);
    // Deleting again is refused.
    expect((await deleteAccount(userId)).ok).toBe(false);
  });

  it("waits while a printed book is still on its way, and deletes nothing", async () => {
    const order = await deliveredOrder();
    await db.order.update({ where: { id: order.id }, data: { status: "in_production" } });
    expect(await deletionBlockers(userId)).toEqual([{ orderId: order.id, title: "Oliver and the Lost Little Star", status: "Printing" }]);
    const r = await deleteAccount(userId);
    expect(r).toMatchObject({ ok: false, reason: "open_orders" });
    expect(await db.childProfile.count({ where: { userId } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
  });

  it("stops if an unfinished checkout turns out to be paid", async () => {
    const start = await startCheckout(userId, { bookId, exportId, address, shippingLevel: "MAIL" });
    if (!start.ok) throw new Error(start.message);
    const order = await db.order.findUniqueOrThrow({ where: { id: start.orderId } });
    // Paid at the payment page, but the confirmation hasn't reached us yet.
    (getPaymentProvider() as MockPaymentProvider).pay(order.checkoutSessionId!);
    const r = await deleteAccount(userId);
    expect(r).toMatchObject({ ok: false, reason: "payment_went_through" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    expect(await db.book.count({ where: { userId } })).toBe(1);
  });

  it("a new account with the same email starts without the welcome credits or a fresh trial", async () => {
    const before = await getAllowance(userId);
    expect(before.used.book).toBe(1);
    expect((await deleteAccount(userId)).ok).toBe(true);
    const again = await makeUser(EMAIL);
    expect((await getCredits(again.id)).balanceUsd).toBe(0);
    expect((await getAllowance(again.id)).used.book).toBe(1);
    // Someone else still gets theirs.
    const other = await makeUser("someone@example.com");
    expect((await getCredits(other.id)).balanceUsd).toBe(5);
    expect((await getAllowance(other.id)).used.book).toBe(0);
  });

  it("a deleted account can't sign in, even with an old session", async () => {
    await db.session.create({ data: { tokenHash: hashToken("old"), userId, expiresAt: new Date(Date.now() + 86400_000) } });
    expect((await userForSession("old"))?.id).toBe(userId);
    // A session made in the moment between the delete's steps still can't be used.
    await deleteAccount(userId);
    await db.session.create({ data: { tokenHash: hashToken("late"), userId, expiresAt: new Date(Date.now() + 86400_000) } });
    expect(await userForSession("late")).toBeNull();
    expect(isDeletedEmail(deletedEmailFor(userId))).toBe(true);
    expect(normalizeEmail(deletedEmailFor(userId))).toBeNull();
    expect(normalizeEmail("Parent@Example.com")).toBe(EMAIL);
  });

  it("the later sweep removes anything a running job wrote after the delete", async () => {
    await deleteAccount(userId);
    const late = `${userPrefix(userId)}children/${childId}/books/${bookId}/pages/late-v1.png`;
    await getStorage().put(late, Buffer.from("png"), "image/png");
    const job = await db.generationJob.findFirstOrThrow({ where: { userId, type: "account.sweep" } });
    expect(await sweepDeletedAccount(userId, job.id)).toEqual({ files: 1 });
    expect(await getStorage().exists(late)).toBe(false);
    // The sweep jobs themselves stay until they've run.
    expect(await db.generationJob.count({ where: { userId, type: "account.sweep" } })).toBe(2);
  });
});
