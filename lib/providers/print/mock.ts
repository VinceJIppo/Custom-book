import crypto from "node:crypto";
import {
  WebhookSignatureError,
  type CoverDimensions,
  type CreateOrderInput,
  type FileValidation,
  type PrintOrderState,
  type PrintOrderStatus,
  type PrintProvider,
  type PrintQuote,
  type ProductSpec,
  type ShippingAddress,
  type ShippingLevel,
  type ShippingOption,
} from "./types";
import { getTrim } from "../../print/geometry";
import { CATALOG, luluSpineWidthIn, spineTextAllowed } from "../../print/products";

/**
 * Offline print provider. Uses the same product catalog and spine rules as
 * Lulu. Cover size is an estimate (Lulu's exact case-wrap size comes from its
 * API), so mock covers are marked approximate.
 */
/** Estimated wrap around the boards for case-wrap covers; softcovers just need bleed. */
const MOCK_HARDCOVER_WRAP_IN = 0.75;
const MOCK_SOFTCOVER_WRAP_IN = 0.125;

export function catalogAsProducts(provider: string): ProductSpec[] {
  return CATALOG.map((c) => ({
    id: c.id,
    provider,
    sku: c.luluSku,
    label: c.label,
    trimSize: c.trimSize,
    binding: c.binding,
    paper: c.paper,
    color: "full" as const,
    pageRules: c.pageRules,
  }));
}

/** Mock shipping prices and delivery days (roughly Lulu-like, for testing only). */
const MOCK_SHIPPING: Partial<Record<ShippingLevel, { cost: number; days: [number, number] }>> = {
  MAIL: { cost: 4.99, days: [8, 14] },
  GROUND: { cost: 7.99, days: [5, 8] },
  EXPEDITED: { cost: 14.99, days: [3, 5] },
  EXPRESS: { cost: 24.99, days: [2, 3] },
};

/** Secret for signing mock webhooks in tests. */
export const MOCK_WEBHOOK_SECRET = "mock-print-webhook-secret";

function addDays(days: number) {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

export class MockPrintProvider implements PrintProvider {
  readonly name = "mock";

  constructor(private readonly stepSeconds = 60) {}

  async getProducts() {
    return catalogAsProducts(this.name);
  }

  async getCoverDimensions(product: ProductSpec, pageCount: number): Promise<CoverDimensions> {
    const trim = getTrim(product.trimSize);
    const spineIn = luluSpineWidthIn(product.binding, pageCount);
    const wrap = product.binding === "hardcover" ? MOCK_HARDCOVER_WRAP_IN : MOCK_SOFTCOVER_WRAP_IN;
    return {
      widthIn: Math.round((2 * trim.widthIn + spineIn + 2 * wrap) * 1000) / 1000,
      heightIn: Math.round((trim.heightIn + 2 * wrap) * 1000) / 1000,
      spineIn,
      spineTextAllowed: spineTextAllowed(pageCount),
      approximate: true,
    };
  }

  async validateFiles(): Promise<FileValidation> {
    return {
      ok: true,
      problems: [],
      interior: { status: "SKIPPED (mock)", errors: [] },
      cover: { status: "SKIPPED (mock)", errors: [] },
    };
  }

  async shippingOptions(_product: ProductSpec, _pageCount: number, address: ShippingAddress): Promise<ShippingOption[]> {
    const intl = address.countryCode.toUpperCase() !== "US";
    return Object.entries(MOCK_SHIPPING).map(([level, v]) => ({
      level: level as ShippingLevel,
      costExclTax: Math.round(v!.cost * (intl ? 2 : 1) * 100) / 100,
      currency: "USD",
      arrivalMin: addDays(v!.days[0] + (intl ? 4 : 0)),
      arrivalMax: addDays(v!.days[1] + (intl ? 6 : 0)),
      traceable: level !== "MAIL",
    }));
  }

  async quote(product: ProductSpec, pageCount: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintQuote> {
    const option = (await this.shippingOptions(product, pageCount, address)).find((o) => o.level === level);
    if (!option) throw new Error(`Shipping level ${level} is not available for this address.`);
    const base = product.binding === "hardcover" ? 12.5 : 6;
    const printCost = Math.round((base + pageCount * 0.1) * 100) / 100;
    const fulfillmentCost = 0.75;
    const taxRate = address.countryCode.toUpperCase() === "US" ? 0.08 : 0;
    const tax = Math.round((printCost + option.costExclTax + fulfillmentCost) * taxRate * 100) / 100;
    const total = Math.round((printCost + option.costExclTax + fulfillmentCost + tax) * 100) / 100;
    return { currency: "USD", shippingLevel: level, printCost, shippingCost: option.costExclTax, fulfillmentCost, fees: 0, tax, total, addressWarnings: [] };
  }

  /**
   * Mock print jobs are stateless: the id carries the creation time, and the
   * status moves on every MOCK_PRINT_STEP_SECONDS (created, in production,
   * shipped, delivered). A recipient named "Reject Test" gets a rejected job,
   * to try the fix-and-resend path.
   */
  async createOrder(input: CreateOrderInput): Promise<PrintOrderState> {
    const reject = /reject test/i.test(input.address.name) ? "r" : "o";
    const id = `mock-${reject}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    return this.getOrderStatus(id);
  }

  async getOrderStatus(id: string): Promise<PrintOrderState> {
    const m = /^mock-([ro])-(\d+)-/.exec(id);
    const created = m ? Number(m[2]) : Date.now();
    if (m?.[1] === "r") {
      return { providerOrderId: id, status: "rejected", providerStatus: "REJECTED", reason: "Test rejection: the interior file could not be read. Make new print files and send the order again." };
    }
    const step = Math.floor((Date.now() - created) / 1000 / this.stepSeconds);
    const states: Array<{ status: PrintOrderStatus; providerStatus: string; reason?: string }> = [
      { status: "created", providerStatus: "PRODUCTION_DELAYED", reason: "Paid. The test printer starts soon." },
      { status: "in_production", providerStatus: "IN_PRODUCTION" },
      { status: "shipped", providerStatus: "SHIPPED" },
      { status: "delivered", providerStatus: "DELIVERED" },
    ];
    const s = states[Math.min(step, states.length - 1)];
    const shipped = s.status === "shipped" || s.status === "delivered";
    return {
      providerOrderId: id,
      ...s,
      trackingNumber: shipped ? `MOCK${created}` : undefined,
      trackingUrl: shipped ? `https://example.com/track/MOCK${created}` : undefined,
      carrier: shipped ? "Test Carrier" : undefined,
      estimatedArrival: new Date(created + 10 * 86400_000).toISOString().slice(0, 10),
    };
  }

  async findOrderByExternalId(): Promise<PrintOrderState | null> {
    return null;
  }

  /** Body: { providerOrderId }, signed like Lulu (HMAC-SHA256 hex) with MOCK_WEBHOOK_SECRET. */
  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<PrintOrderState | null> {
    const mac = crypto.createHmac("sha256", MOCK_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const given = headers["x-mock-signature"] ?? "";
    if (given.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(mac))) throw new WebhookSignatureError();
    const { providerOrderId } = JSON.parse(rawBody) as { providerOrderId?: string };
    return providerOrderId ? this.getOrderStatus(providerOrderId) : null;
  }
}
