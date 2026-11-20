import type { CoverDimensions, CreateOrderInput, FileValidation, PrintOrderState, PrintProvider, PrintQuote, ProductSpec, ShippingAddress, ShippingLevel } from "./types";
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

const orders = new Map<string, PrintOrderState>();

export class MockPrintProvider implements PrintProvider {
  readonly name = "mock";

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

  async quote(_product: ProductSpec, pageCount: number, _address: ShippingAddress, level: ShippingLevel): Promise<PrintQuote> {
    const printCost = Math.round((8 + pageCount * 0.1) * 100) / 100;
    const shippingCost = { MAIL: 4.99, GROUND: 7.99, EXPEDITED: 14.99, EXPRESS: 24.99 }[level];
    const tax = Math.round((printCost + shippingCost) * 0.08 * 100) / 100;
    return { currency: "USD", printCost, shippingCost, tax, total: Math.round((printCost + shippingCost + tax) * 100) / 100, shippingLevel: level };
  }

  async createOrder(input: CreateOrderInput): Promise<PrintOrderState> {
    const state: PrintOrderState = { providerOrderId: `mock_${input.externalId}`, status: "created" };
    orders.set(state.providerOrderId, state);
    return state;
  }

  async getOrderStatus(id: string): Promise<PrintOrderState> {
    return orders.get(id) ?? { providerOrderId: id, status: "created" };
  }

  async handleWebhook(): Promise<PrintOrderState | null> {
    return null;
  }
}
