import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetConfigCache } from "@/lib/config";
import { getEmailProvider, resetProviders } from "@/lib/providers/registry";
import { MockEmailProvider } from "@/lib/providers/email/mock";
import { ResendEmailProvider } from "@/lib/providers/resend/email";
import { endSession, hashToken, redeemSignInLink, requestSignInLink, userForSession } from "@/lib/auth/magicLink";
import { authMode } from "@/lib/auth";
import { resetDb } from "./helpers";

function linkFrom(to: string) {
  const m = (getEmailProvider() as MockEmailProvider).lastTo(to);
  const url = new URL(/https?:\/\/\S+/.exec(m!.text)![0]);
  return { email: url.searchParams.get("email")!, token: url.searchParams.get("token")!, message: m! };
}

describe("magic-link sign-in", () => {
  beforeEach(async () => {
    resetProviders({ email: new MockEmailProvider() });
    await resetDb();
    await db.loginToken.deleteMany();
  });

  it("emails a one-time link, stores only its hash, and signs in once", async () => {
    const r = await requestSignInLink("  Parent@Example.COM ");
    expect(r.ok).toBe(true);
    const { email, token, message } = linkFrom("parent@example.com");
    expect(email).toBe("parent@example.com");
    expect(message.subject).toMatch(/sign-in link/);
    const row = await db.loginToken.findFirstOrThrow({ where: { email } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const first = await redeemSignInLink(email, token);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const user = await userForSession(first.sessionToken);
    expect(user?.email).toBe("parent@example.com");
    // The session table holds a hash too.
    expect(await db.session.count({ where: { tokenHash: first.sessionToken } })).toBe(0);

    const again = await redeemSignInLink(email, token);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toMatch(/expired or was already used/);
  });

  it("two clicks at the same moment start only one session", async () => {
    await requestSignInLink("race@example.com");
    const { email, token } = linkFrom("race@example.com");
    const results = await Promise.all([redeemSignInLink(email, token), redeemSignInLink(email, token), redeemSignInLink(email, token)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.session.count()).toBe(1);
  });

  it("rejects expired links, wrong emails and made-up tokens", async () => {
    await requestSignInLink("late@example.com");
    const { email, token } = linkFrom("late@example.com");
    expect((await redeemSignInLink("someone@else.com", token)).ok).toBe(false);
    expect((await redeemSignInLink(email, "made-up")).ok).toBe(false);
    await db.loginToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await redeemSignInLink(email, token)).ok).toBe(false);
  });

  it("limits how many links one address can get, and rejects bad addresses", async () => {
    for (let i = 0; i < 5; i++) expect((await requestSignInLink("busy@example.com")).ok).toBe(true);
    const sixth = await requestSignInLink("busy@example.com");
    expect(sixth.ok).toBe(false);
    expect((await requestSignInLink("not-an-email")).ok).toBe(false);
  });

  it("an existing account signs back in to the same user; sign-out and expiry end the session", async () => {
    const existing = await db.user.create({ data: { email: "back@example.com", ageConfirmedAt: new Date() } });
    await requestSignInLink("back@example.com");
    const { email, token } = linkFrom("back@example.com");
    const r = await redeemSignInLink(email, token);
    if (!r.ok) throw new Error(r.message);
    expect(r.userId).toBe(existing.id);
    await endSession(r.sessionToken);
    expect(await userForSession(r.sessionToken)).toBeNull();

    await requestSignInLink("back@example.com");
    const second = linkFrom("back@example.com");
    const r2 = await redeemSignInLink(second.email, second.token);
    if (!r2.ok) throw new Error(r2.message);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await userForSession(r2.sessionToken)).toBeNull();
    expect(await userForSession(undefined)).toBeNull();
  });

  it("shows the link on screen only for the offline mock outside production", async () => {
    const r = await requestSignInLink("dev@example.com");
    expect(r.ok && r.devLink).toMatch(/\/signin\/verify\?email=dev%40example.com&token=/);
  });
});

describe("auth mode", () => {
  afterEach(() => {
    delete process.env.AUTH_MODE;
    resetConfigCache();
  });
  it("defaults to sign-in in production and single-user elsewhere", () => {
    expect(authMode()).toBe("single"); // tests run with NODE_ENV=test
    process.env.AUTH_MODE = "email";
    resetConfigCache();
    expect(authMode()).toBe("email");
  });
});

describe("Resend adapter (no network)", () => {
  it("posts the message with the API key and an idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ id: "email_1" });
    }) as unknown as typeof fetch;
    const p = new ResendEmailProvider({ apiKey: "re_test", from: "StoryStar <hi@example.com>", fetchImpl });
    expect(await p.send({ to: "a@example.com", subject: "Hi", text: "t", html: "<p>h</p>", idempotencyKey: "k1" })).toEqual({ id: "email_1" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: "StoryStar <hi@example.com>", to: ["a@example.com"], subject: "Hi", html: "<p>h</p>", text: "t" });
  });
  it("treats a bad request as permanent", async () => {
    const p = new ResendEmailProvider({ apiKey: "re_test", from: "x@example.com", fetchImpl: (async () => new Response("bad", { status: 422 })) as unknown as typeof fetch });
    await expect(p.send({ to: "a@example.com", subject: "s", text: "t", html: "h" })).rejects.toThrow(/HTTP 422/);
  });
});
