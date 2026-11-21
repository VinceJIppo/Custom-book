import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { LuluPrintProvider, LULU_SANDBOX, mapLuluJob, verifyLuluHmac } from "@/lib/providers/lulu/print";
import { catalogAsProducts } from "@/lib/providers/print/mock";
import { WebhookSignatureError, type ShippingAddress } from "@/lib/providers/print/types";

const product = catalogAsProducts("lulu").find((p) => p.id === "hardcover-square-8.5")!;
const address: ShippingAddress = { name: "Grandma Rose", street1: "12 Elm Street", street2: "Apt 4", city: "Springfield", stateCode: "IL", postcode: "62704", countryCode: "US", phone: "+1 217 555 0100" };

function fake(routes: Array<(url: string, init: RequestInit) => Response | null>) {
  const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body).startsWith("{") ? String(init.body) : "null") : null });
    for (const r of routes) {
      const res = r(url, init);
      if (res) return res;
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const token = (url: string) => (url.endsWith("/openid-connect/token") ? Response.json({ access_token: "tok", expires_in: 3600 }) : null);
const lulu = (f: typeof fetch) => new LuluPrintProvider({ baseUrl: LULU_SANDBOX, clientKey: "key", clientSecret: "secret", fetchImpl: f, sleep: async () => {} });
const api = (calls: Array<{ url: string; body: unknown }>) => calls.filter((c) => !c.url.endsWith("/token"));

describe("Lulu ordering adapter (no network)", () => {
  it("lists shipping speeds for the address, cheapest per level, without business-only options", async () => {
    const { f, calls } = fake([
      token,
      (url) =>
        url.endsWith("/shipping-options/")
          ? Response.json([
              { level: "EXPRESS", cost_excl_tax: "39.00", currency: "USD", max_delivery_date: "2026-11-25T00:00:00Z", traceable: true },
              { level: "MAIL", cost_excl_tax: "5.99", currency: "USD", min_delivery_date: "2026-11-28", max_delivery_date: "2026-12-04", traceable: false },
              { level: "MAIL", cost_excl_tax: "4.99", currency: "USD", max_delivery_date: "2026-12-05" },
              { level: "GROUND_BUS", cost_excl_tax: "9.00", currency: "USD", business_only: true },
            ])
          : null,
    ]);
    const options = await lulu(f).shippingOptions(product, 32, address);
    expect(options.map((o) => [o.level, o.costExclTax])).toEqual([
      ["MAIL", 4.99],
      ["EXPRESS", 39],
    ]);
    expect(options[1].arrivalMax).toBe("2026-11-25");
    expect(api(calls)[0].body).toEqual({
      line_items: [{ pod_package_id: product.sku, page_count: 32, quantity: 1 }],
      shipping_address: { country: "US", state: "IL", postcode: "62704", city: "Springfield", street1: "12 Elm Street", street2: "Apt 4", name: "Grandma Rose", phone_number: "+1 217 555 0100" },
      currency: "USD",
    });
  });

  it("quotes print, shipping, fulfillment and tax from a cost calculation, with address corrections", async () => {
    const { f, calls } = fake([
      token,
      (url) =>
        url.endsWith("/print-job-cost-calculations/")
          ? Response.json(
              {
                currency: "USD",
                line_item_costs: [{ total_cost_incl_tax: "17.28" }],
                shipping_cost: { total_cost_incl_tax: "5.39" },
                fulfillment_cost: { total_cost_incl_tax: "0.81" },
                fees: [{ total_cost_incl_tax: "0.50" }],
                total_tax: "1.78",
                total_cost_incl_tax: "23.98",
                shipping_address: { warnings: [{ message: "street1: 12 Elm Street -> 12 Elm St" }], suggested_address: { street1: "12 Elm St", city: "Springfield", postcode: 62704, state_code: "IL", country_code: "US" } },
              },
              { status: 201 },
            )
          : null,
    ]);
    const q = await lulu(f).quote(product, 32, address, "MAIL");
    expect(q).toMatchObject({ printCost: 17.28, shippingCost: 5.39, fulfillmentCost: 0.81, fees: 0.5, tax: 1.78, total: 23.98, shippingLevel: "MAIL" });
    expect(q.addressWarnings).toEqual([{ message: "street1: 12 Elm Street -> 12 Elm St" }]);
    expect(q.suggestedAddress).toMatchObject({ street1: "12 Elm St", postcode: "62704" });
    expect(api(calls)[0].body).toMatchObject({
      shipping_option: "MAIL",
      line_items: [{ pod_package_id: product.sku, page_count: 32, quantity: 1 }],
      shipping_address: { name: "Grandma Rose", street1: "12 Elm Street", city: "Springfield", state_code: "IL", postcode: "62704", country_code: "US", phone_number: "+1 217 555 0100" },
    });
  });

  it("creates a print job with the PDF URLs, product, shipping level and our order id", async () => {
    const { f, calls } = fake([
      token,
      (url, init) =>
        url.endsWith("/print-jobs/") && init.method === "POST"
          ? Response.json({ id: 4242, status: { name: "CREATED", message: "Print-job is currently being validated" }, estimated_shipping_dates: { arrival_max: "2026-12-04" } }, { status: 201 })
          : null,
    ]);
    const state = await lulu(f).createOrder({
      product,
      pageCount: 32,
      interiorUrl: "https://pub.example/api/files/i.pdf?sig=1",
      coverUrl: "https://pub.example/api/files/c.pdf?sig=2",
      title: "Oliver and the Giggle-Bell",
      address,
      shippingLevel: "GROUND",
      externalId: "order_123",
      contactEmail: "owner@example.com",
    });
    expect(state).toMatchObject({ providerOrderId: "4242", status: "created", providerStatus: "CREATED", estimatedArrival: "2026-12-04" });
    expect(api(calls)[0].body).toEqual({
      contact_email: "owner@example.com",
      external_id: "order_123",
      shipping_level: "GROUND",
      shipping_address: { name: "Grandma Rose", street1: "12 Elm Street", street2: "Apt 4", city: "Springfield", state_code: "IL", postcode: "62704", country_code: "US", phone_number: "+1 217 555 0100" },
      line_items: [
        {
          external_id: "order_123",
          title: "Oliver and the Giggle-Bell",
          quantity: 1,
          printable_normalization: { pod_package_id: product.sku, cover: { source_url: "https://pub.example/api/files/c.pdf?sig=2" }, interior: { source_url: "https://pub.example/api/files/i.pdf?sig=1" } },
        },
      ],
    });
  });

  it("finds an earlier print job by our exact order id (search can match other fields)", async () => {
    const { f, calls } = fake([
      token,
      (url) => (url.includes("/print-jobs/?search=") ? Response.json({ results: [{ id: 1, external_id: "order_1234", status: { name: "CREATED" } }, { id: 2, external_id: "order_123", status: { name: "UNPAID" } }] }) : null),
    ]);
    const found = await lulu(f).findOrderByExternalId("order_123");
    expect(found?.providerOrderId).toBe("2");
    expect(api(calls)[0].url).toBe(`${LULU_SANDBOX}/print-jobs/?search=order_123`);
  });

  it("maps every Lulu status to ours, with a plain-English reason", () => {
    expect(mapLuluJob({ id: 1, status: { name: "UNPAID" } })).toMatchObject({ status: "created", providerStatus: "UNPAID", reason: expect.stringMatching(/Add a card in your Lulu developer account/) });
    expect(mapLuluJob({ id: 1, status: { name: "PRODUCTION_DELAYED" } }).status).toBe("created");
    expect(mapLuluJob({ id: 1, status: { name: "IN_PRODUCTION" } }).status).toBe("in_production");
    expect(mapLuluJob({ id: 1, status: { name: "DELIVERED" } }).status).toBe("delivered");
    expect(mapLuluJob({ id: 1, status: { name: "CANCELED" } }).status).toBe("cancelled");
    const rejected = mapLuluJob({ id: 1, status: { name: "REJECTED", message: "File error." }, line_items: [{ status: { name: "REJECTED", messages: { error: "Interior page size does not match the product." } } }] });
    expect(rejected).toMatchObject({ status: "rejected", reason: "File error. Interior page size does not match the product." });
  });

  it("reads tracking from the status (shipped example in Lulu's docs) or the line items", () => {
    const fromStatus = mapLuluJob({
      id: 42776,
      status: { name: "SHIPPED", line_item_statuses: [{ name: "SHIPPED", messages: { tracking_id: "3d4a_1", tracking_urls: ["https://track.example/3d4a_1"], carrier_name: "Carrier" } }] },
    });
    expect(fromStatus).toMatchObject({ status: "shipped", trackingNumber: "3d4a_1", trackingUrl: "https://track.example/3d4a_1", carrier: "Carrier" });
    const fromItems = mapLuluJob({ id: 9, status: { name: "SHIPPED" }, line_items: [{ tracking_id: "T9", tracking_urls: ["https://t/9"], carrier_name: "UPS" }] });
    expect(fromItems).toMatchObject({ trackingNumber: "T9", trackingUrl: "https://t/9", carrier: "UPS" });
  });

  it("accepts webhooks only with a valid HMAC of the raw body (hex or base64)", async () => {
    const body = JSON.stringify({ topic: "PRINT_JOB_STATUS_CHANGED", data: { id: 77, status: { name: "IN_PRODUCTION" } } });
    const mac = crypto.createHmac("sha256", "secret").update(body).digest();
    const p = lulu(fake([]).f);
    expect(await p.handleWebhook(body, { "lulu-hmac-sha256": mac.toString("hex") })).toMatchObject({ providerOrderId: "77", status: "in_production" });
    expect(await p.handleWebhook(body, { "lulu-hmac-sha256": mac.toString("base64") })).toMatchObject({ status: "in_production" });
    await expect(p.handleWebhook(body, { "lulu-hmac-sha256": "0".repeat(64) })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(p.handleWebhook(body, {})).rejects.toBeInstanceOf(WebhookSignatureError);
    // A re-serialized body (different whitespace) no longer matches.
    await expect(p.handleWebhook(JSON.stringify(JSON.parse(body), null, 2), { "lulu-hmac-sha256": mac.toString("hex") })).rejects.toBeInstanceOf(WebhookSignatureError);
    expect(verifyLuluHmac(body, mac.toString("hex"), "")).toBe(false);
    const other = JSON.stringify({ topic: "SOMETHING_ELSE", data: { id: 1 } });
    expect(await p.handleWebhook(other, { "lulu-hmac-sha256": crypto.createHmac("sha256", "secret").update(other).digest("hex") })).toBeNull();
  });

  it("subscribes the status webhook once", async () => {
    const { f, calls } = fake([
      token,
      (url, init) => (url.endsWith("/webhooks/") && init.method === "GET" ? Response.json({ results: [] }) : null),
      (url, init) => (url.endsWith("/webhooks/") && init.method === "POST" ? Response.json({ id: "w1", url: "https://pub.example/api/webhooks/print/lulu", topics: ["PRINT_JOB_STATUS_CHANGED"], is_active: true }, { status: 201 }) : null),
    ]);
    const w = await lulu(f).subscribeWebhook("https://pub.example/api/webhooks/print/lulu");
    expect(w.created).toBe(true);
    expect(api(calls)[1].body).toEqual({ topics: ["PRINT_JOB_STATUS_CHANGED"], url: "https://pub.example/api/webhooks/print/lulu" });
  });
});
