import type { TrimSizeId } from "../../print/geometry";
import type { PageCountRules } from "../../print/padding";

export interface ProductSpec {
  /** Our product id, stable across providers. */
  id: string;
  provider: string;
  /** Provider SKU, e.g. a Lulu pod_package_id. */
  sku: string;
  label: string;
  trimSize: TrimSizeId;
  binding: "hardcover" | "softcover";
  paper: string;
  color: "full";
  pageRules: PageCountRules;
}

export interface CoverDimensions {
  widthIn: number;
  heightIn: number;
  spineIn: number;
  /** Whether the spine may carry text. */
  spineTextAllowed: boolean;
  /** True when the size is an offline estimate rather than the provider's answer. */
  approximate?: boolean;
}

export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  stateCode?: string;
  postcode: string;
  countryCode: string;
  phone: string;
  email?: string;
}

/** Shipping speeds, slowest first (Lulu's levels; other providers map onto these). */
export const SHIPPING_LEVELS = ["MAIL", "PRIORITY_MAIL", "GROUND_HD", "GROUND_BUS", "GROUND", "EXPEDITED", "EXPRESS"] as const;
export type ShippingLevel = (typeof SHIPPING_LEVELS)[number];

export interface ShippingOption {
  level: ShippingLevel;
  /** Shipping cost before tax, as the provider lists it. */
  costExclTax: number;
  currency: string;
  /** Estimated delivery dates (YYYY-MM-DD) when the provider gives them. */
  arrivalMin?: string;
  arrivalMax?: string;
  traceable?: boolean;
}

export interface AddressWarning {
  message: string;
}

export interface PrintQuote {
  currency: string;
  shippingLevel: ShippingLevel;
  /** All amounts include tax unless named otherwise. */
  printCost: number;
  shippingCost: number;
  fulfillmentCost: number;
  /** Other provider fees. */
  fees: number;
  /** Tax included in the amounts above. */
  tax: number;
  /** What the provider charges us in total. */
  total: number;
  /** Address corrections or warnings from the provider, for the parent to check. */
  addressWarnings?: AddressWarning[];
  suggestedAddress?: Partial<ShippingAddress>;
}

export interface FileCheck {
  /** Provider status, e.g. Lulu VALIDATED / NORMALIZED / ERROR. */
  status: string;
  errors: string[];
  pageCount?: number;
}

export interface FileValidation {
  ok: boolean;
  /** Plain-English problems for the parent. */
  problems: string[];
  interior?: FileCheck;
  cover?: FileCheck;
}

export interface ValidateFilesInput {
  interiorUrl: string;
  coverUrl: string;
  product: ProductSpec;
  pageCount: number;
  /** Called as the provider reports progress (validation can take minutes). */
  onProgress?: (message: string) => void;
}

export type PrintOrderStatus = "created" | "in_production" | "shipped" | "delivered" | "rejected" | "cancelled";

export interface PrintOrderState {
  providerOrderId: string;
  status: PrintOrderStatus;
  /** The provider's own status name, e.g. Lulu UNPAID. */
  providerStatus?: string;
  /** Plain-English detail (why it was rejected, what it's waiting for). */
  reason?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  /** Estimated delivery (YYYY-MM-DD). */
  estimatedArrival?: string;
}

export interface CreateOrderInput {
  product: ProductSpec;
  pageCount: number;
  interiorUrl: string;
  coverUrl: string;
  title: string;
  address: ShippingAddress;
  shippingLevel: ShippingLevel;
  externalId: string;
  contactEmail: string;
}

export interface PrintProvider {
  readonly name: string;
  getProducts(): Promise<ProductSpec[]>;
  getCoverDimensions(product: ProductSpec, pageCount: number): Promise<CoverDimensions>;
  validateFiles(input: ValidateFilesInput): Promise<FileValidation>;
  /** Shipping speeds available to this address, with delivery estimates. */
  shippingOptions(product: ProductSpec, pageCount: number, address: ShippingAddress): Promise<ShippingOption[]>;
  quote(product: ProductSpec, pageCount: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintQuote>;
  createOrder(input: CreateOrderInput): Promise<PrintOrderState>;
  getOrderStatus(providerOrderId: string): Promise<PrintOrderState>;
  /** Finds a print job we created earlier by our order id (so a retry never prints twice). */
  findOrderByExternalId(externalId: string): Promise<PrintOrderState | null>;
  /**
   * Verifies and reads a webhook. rawBody is the exact request body (needed for
   * signatures). Returns null for events that don't change an order; throws
   * WebhookSignatureError when the signature is wrong.
   */
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<PrintOrderState | null>;
}

export class WebhookSignatureError extends Error {
  constructor(message = "Webhook signature did not match") {
    super(message);
  }
}
