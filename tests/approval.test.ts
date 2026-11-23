import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetConfigCache } from "@/lib/config";
import { getEmailProvider, resetProviders } from "@/lib/providers/registry";
import { MockEmailProvider } from "@/lib/providers/email/mock";
import { redeemSignInLink, requestSignInLink } from "@/lib/auth/magicLink";
import { approveAccount, declineAccount, isApproved } from "@/lib/accounts/approval";
import { creditProblem, getCredits } from "@/lib/credits";
import { resetDb } from "./helpers";

const ADMIN = "owner@example.com";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigCache();
}

async function signUp(email: string) {
  await requestSignInLink(email);
  const m = (getEmailProvider() as MockEmailProvider).lastTo(email)!;
  const url = new URL(/https?:\/\/\S+/.exec(m.text)![0]);
  const r = await redeemSignInLink(url.searchParams.get("email"), url.searchParams.get("token")!);
  if (!r.ok) throw new Error(r.message);
  return db.user.findUniqueOrThrow({ where: { id: r.userId } });
}

describe("new accounts need approval", () => {
  beforeEach(async () => {
    setEnv({ NEW_ACCOUNT_APPROVAL: "true", CREDITS_ENABLED: "true", ADMIN_EMAILS: ADMIN, AUTH_MODE: "email" });
    resetProviders({ email: new MockEmailProvider() });
    await resetDb();
    await db.loginToken.deleteMany();
  });
  afterEach(() => {
    setEnv({ NEW_ACCOUNT_APPROVAL: undefined, CREDITS_ENABLED: "false", ADMIN_EMAILS: undefined, AUTH_MODE: undefined });
    resetProviders();
  });

  it("a new account waits, the admin is emailed once, and nothing that costs money works yet", async () => {
    const user = await signUp("new.parent@example.com");
    expect(user.approval).toBe("pending");
    expect(isApproved(user)).toBe(false);
    const mail = new MockEmailProvider().lastTo(ADMIN);
    expect(mail?.subject).toBe("[StoryStar] New account to approve: new.parent@example.com");
    expect(mail?.text).toContain("/admin/accounts");
    // Signing in again doesn't email the admin again.
    const before = mail;
    await signUp("new.parent@example.com");
    expect(new MockEmailProvider().lastTo(ADMIN)).toBe(before);
    // No welcome credits, and paid work is refused.
    expect((await getCredits(user.id)).balanceUsd).toBe(0);
    expect(await creditProblem(user.id, 0.5)).toMatch(/waiting for approval/);
  });

  it("approving gives the welcome credits and emails the parent; only admins can decide", async () => {
    const user = await signUp("new.parent@example.com");
    expect((await approveAccount({ email: "someone@example.com" }, user.id)).ok).toBe(false);
    expect((await approveAccount({ email: ADMIN }, user.id)).ok).toBe(true);
    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(isApproved(fresh)).toBe(true);
    expect((await getCredits(user.id)).balanceUsd).toBe(5);
    expect(new MockEmailProvider().lastTo("new.parent@example.com")?.subject).toBe("Your StoryStar account is ready");
    expect(await creditProblem(user.id, 0.5)).toBeNull();
  });

  it("declined accounts stay blocked; admins and existing accounts are never held up", async () => {
    const user = await signUp("spammy@example.com");
    expect((await declineAccount({ email: ADMIN }, user.id)).ok).toBe(true);
    expect(isApproved(await db.user.findUniqueOrThrow({ where: { id: user.id } }))).toBe(false);
    const admin = await signUp(ADMIN);
    expect(admin.approval).toBe("approved");
    // Accounts that existed before approval was turned on default to approved.
    const old = await db.user.create({ data: { email: "old@example.com" } });
    expect(isApproved(old)).toBe(true);
  });
});
