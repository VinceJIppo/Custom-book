import { describe, expect, it } from "vitest";
import { LuluPrintProvider, LULU_SANDBOX } from "@/lib/providers/lulu/print";
import { catalogAsProducts } from "@/lib/providers/print/mock";
import { PermanentProviderError } from "@/lib/providers/types";

const product = catalogAsProducts("lulu").find((p) => p.id === "hardcover-square-8.5")!;

function fake(routes: Array<(url: string, init: RequestInit) => Response | null>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    for (const r of routes) {
      const res = r(url, init);
      if (res) return res;
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const token = (url: string) => (url.endsWith("/openid-connect/token") ? Response.json({ access_token: "tok", expires_in: 3600 }) : null);
const lulu = (f: typeof fetch) => new LuluPrintProvider({ baseUrl: LULU_SANDBOX, clientKey: "key", clientSecret: "secret", fetchImpl: f, sleep: async () => {}, pollIntervalMs: 0 });

describe("Lulu adapter (no network)", () => {
  it("signs in with client credentials and asks for cover dimensions in inches", async () => {
    const { f, calls } = fake([token, (url) => (url.endsWith("/cover-dimensions/") ? Response.json({ width: "1350.000", height: "720.000", unit: "pt" }, { status: 201 }) : null)]);
    const p = lulu(f);
    const dims = await p.getCoverDimensions(product, 24);
    expect(calls[0].url).toBe(`${LULU_SANDBOX}/auth/realms/glasstree/protocol/openid-connect/token`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
    expect(calls[0].init.body).toBe("grant_type=client_credentials");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ pod_package_id: "0850X0850.FC.PRE.CW.080CW444.GXX", interior_page_count: 24, unit: "inch" });
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    // The response came back in points despite the request: still converted correctly.
    expect(dims).toMatchObject({ widthIn: 18.75, heightIn: 10, spineIn: 0.25, spineTextAllowed: false });
    await p.getCoverDimensions(product, 30);
    expect(calls.filter((c) => c.url.includes("openid-connect")).length).toBe(1); // token cached
  });

  it("validates interior then cover, polling until final", async () => {
    let interiorPolls = 0;
    const { f, calls } = fake([
      token,
      (url, init) => (url.endsWith("/validate-interior/") && init.method === "POST" ? Response.json({ id: 11, status: "VALIDATING" }, { status: 201 }) : null),
      (url) => (url.endsWith("/validate-interior/11/") ? Response.json({ id: 11, status: ++interiorPolls < 3 ? "VALIDATING" : "NORMALIZED", errors: null, page_count: 24 }) : null),
      (url, init) => (url.endsWith("/validate-cover/") && init.method === "POST" ? Response.json({ id: 22, status: "NORMALIZING" }, { status: 201 }) : null),
      (url) => (url.endsWith("/validate-cover/22/") ? Response.json({ id: 22, status: "NORMALIZED", errors: null }) : null),
    ]);
    const progress: string[] = [];
    const r = await lulu(f).validateFiles({ interiorUrl: "https://x.test/i.pdf", coverUrl: "https://x.test/c.pdf", product, pageCount: 24, onProgress: (m) => progress.push(m) });
    expect(r.ok).toBe(true);
    expect(r.interior).toMatchObject({ status: "NORMALIZED", pageCount: 24 });
    expect(r.cover?.status).toBe("NORMALIZED");
    expect(interiorPolls).toBe(3);
    const interiorPost = calls.find((c) => c.url.endsWith("/validate-interior/"))!;
    expect(JSON.parse(String(interiorPost.init.body))).toEqual({ source_url: "https://x.test/i.pdf", pod_package_id: product.sku });
    const coverPost = calls.find((c) => c.url.endsWith("/validate-cover/"))!;
    expect(JSON.parse(String(coverPost.init.body))).toEqual({ source_url: "https://x.test/c.pdf", pod_package_id: product.sku, interior_page_count: 24 });
    expect(progress.some((m) => m.includes("interior"))).toBe(true);
  });

  it("reports Lulu's errors and page-count mismatches in plain English", async () => {
    const { f } = fake([
      token,
      (url, init) => (url.endsWith("/validate-interior/") && init.method === "POST" ? Response.json({ id: 1 }, { status: 201 }) : null),
      (url) => (url.endsWith("/validate-interior/1/") ? Response.json({ id: 1, status: "ERROR", errors: ["fonts not embedded"], page_count: 22 }) : null),
      (url, init) => (url.endsWith("/validate-cover/") && init.method === "POST" ? Response.json({ id: 2 }, { status: 201 }) : null),
      (url) => (url.endsWith("/validate-cover/2/") ? Response.json({ id: 2, status: "ERROR", errors: ["invalid file size"] }) : null),
    ]);
    const r = await lulu(f).validateFiles({ interiorUrl: "https://x/i", coverUrl: "https://x/c", product, pageCount: 24 });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(["Interior: fonts not embedded", "Interior: Lulu counted 22 pages, we expected 24.", "Cover: invalid file size"]);
  });

  it("backs off on rate limits and treats bad credentials as permanent", async () => {
    let n = 0;
    const { f } = fake([token, (url) => (url.endsWith("/cover-dimensions/") ? (++n < 3 ? new Response("slow down", { status: 429 }) : Response.json({ width: "18.75", height: "10", unit: "inch" })) : null)]);
    expect((await lulu(f).getCoverDimensions(product, 24)).widthIn).toBe(18.75);
    expect(n).toBe(3);
    const bad = fake([(url) => (url.endsWith("/openid-connect/token") ? new Response("no", { status: 401 }) : null)]);
    await expect(lulu(bad.f).getCoverDimensions(product, 24)).rejects.toBeInstanceOf(PermanentProviderError);
  });
});
