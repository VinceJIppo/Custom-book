import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorage } from "@/lib/storage/local";

const dir = ".data/test-storage/unit";
const s = new LocalStorage(dir, "sign-secret", "enc-key", "", 300);

describe("local storage", () => {
  it("encrypts at rest and round-trips", async () => {
    await s.put("users/u1/children/c1/a.txt", Buffer.from("hello child"), "text/plain");
    const raw = fs.readFileSync(path.join(dir, "users/u1/children/c1/a.txt.bin"));
    expect(raw.includes(Buffer.from("hello child"))).toBe(false);
    const got = await s.get("users/u1/children/c1/a.txt");
    expect(got?.data.toString()).toBe("hello child");
    expect(got?.meta.contentType).toBe("text/plain");
  });

  it("signed URLs verify, expire, and resist tampering", async () => {
    const url = new URL(await s.signedUrl("users/u1/children/c1/a.txt", 60), "http://x");
    const key = url.pathname.replace("/api/files/", "");
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(s.verify(key, exp, sig)).toBe(true);
    expect(s.verify("users/u1/children/c2/a.txt", exp, sig)).toBe(false);
    expect(s.verify(key, String(Number(exp) + 100), sig)).toBe(false);
    expect(s.verify(key, String(Math.floor(Date.now() / 1000) - 1), sig)).toBe(false);
  });

  it("rejects path traversal keys", async () => {
    await expect(s.put("../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await expect(s.put("/abs", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });

  it("deletes a whole prefix", async () => {
    await s.put("users/u1/children/c9/x.txt", Buffer.from("1"), "text/plain");
    await s.put("users/u1/children/c9/books/b/y.txt", Buffer.from("2"), "text/plain");
    expect(await s.deletePrefix("users/u1/children/c9/")).toBe(2);
    expect(await s.exists("users/u1/children/c9/x.txt")).toBe(false);
    expect(await s.exists("users/u1/children/c1/a.txt")).toBe(true);
  });
});

describe("stable signed links", () => {
  it("the same file gets the same link for a few minutes, so browsers can reuse it", async () => {
    const { LocalStorage } = await import("@/lib/storage/local");
    const s = new LocalStorage(".data/test-storage", "secret-secret-secret-secret", "key-key-key-key-key-key-key", "", 300, "http://localhost:3000");
    const a = await s.signedUrl("users/u/x.png");
    const b = await s.signedUrl("users/u/x.png");
    expect(a).toBe(b);
    const exp = Number(new URL(a, "http://localhost").searchParams.get("exp"));
    expect(exp % 300).toBe(0);
    expect(exp - Date.now() / 1000).toBeGreaterThanOrEqual(299);
  });
});
