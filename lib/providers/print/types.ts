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

export type ShippingLevel = "MAIL" | "GROUND" | "EXPEDITED" | "EXPRESS";

export interface PrintQuote {
  currency: string;
  printCost: number;
  shippingCost: number;
  tax: number;
  total: number;
  shippingLevel: ShippingLevel;
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
  reason?: string;
  trackingNumber?: string;
  trackingUrl?: string;
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
  quote(product: ProductSpec, pageCount: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintQuote>;
  createOrder(input: CreateOrderInput): Promise<PrintOrderState>;
  getOrderStatus(providerOrderId: string): Promise<PrintOrderState>;
  handleWebhook(payload: unknown, headers: Record<string, string>): Promise<PrintOrderState | null>;
}
