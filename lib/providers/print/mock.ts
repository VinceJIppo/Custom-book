import type { CoverDimensions, CreateOrderInput, FileValidation, PrintOrderState, PrintProvider, PrintQuote, ProductSpec, ShippingAddress, ShippingLevel } from "./types";
import { coverSpreadSizeIn, getTrim } from "../../print/geometry";

/**
 * Offline print provider. Its page rules mirror a typical hardcover picture
 * book (min 24, multiple of 2) and are re-checked against Lulu in Phase 3.
 */
const PRODUCTS: ProductSpec[] = [
  {
    id: "hardcover-square-8.5",
    provider: "mock",
    sku: "MOCK-HC-8.5SQ",
    label: "Hardcover, 8.5 x 8.5 in square",
    trimSize: "square-8.5",
    binding: "hardcover",
    paper: "80# coated white",
    color: "full",
    pageRules: { minPages: 24, maxPages: 800, multiple: 2 },
  },
  {
    id: "softcover-square-8.5",
    provider: "mock",
    sku: "MOCK-SC-8.5SQ",
    label: "Softcover, 8.5 x 8.5 in square",
    trimSize: "square-8.5",
    binding: "softcover",
    paper: "80# coated white",
    color: "full",
    pageRules: { minPages: 24, maxPages: 800, multiple: 2 },
  },
  {
    id: "hardcover-portrait-8x10",
    provider: "mock",
    sku: "MOCK-HC-8X10",
    label: "Hardcover, 8 x 10 in portrait",
    trimSize: "portrait-8x10",
    binding: "hardcover",
    paper: "80# coated white",
    color: "full",
    pageRules: { minPages: 24, maxPages: 800, multiple: 2 },
  },
];

const orders = new Map<string, PrintOrderState>();

export class MockPrintProvider implements PrintProvider {
  readonly name = "mock";

  async getProducts() {
    return PRODUCTS;
  }

  async getCoverDimensions(product: ProductSpec, pageCount: number): Promise<CoverDimensions> {
    const spineIn = Math.round((pageCount * 0.0025 + (product.binding === "hardcover" ? 0.2 : 0.06)) * 1000) / 1000;
    const wrap = product.binding === "hardcover" ? 0.75 : 0.125;
    const size = coverSpreadSizeIn(getTrim(product.trimSize), spineIn, wrap);
    return { ...size, spineIn, spineTextAllowed: spineIn >= 0.25 };
  }

  async validateFiles(): Promise<FileValidation> {
    return { ok: true, problems: [] };
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
