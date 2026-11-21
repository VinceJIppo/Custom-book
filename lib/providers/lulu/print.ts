/**
 * Lulu Print API adapter. Checked against Lulu's OpenAPI spec
 * (api.lulu.com/api-docs/openapi-specs/openapi_public.yml) on 2026-11-20:
 *   token:  POST {base}/auth/realms/glasstree/protocol/openid-connect/token
 *           Basic base64(client_key:client_secret), grant_type=client_credentials
 *   POST /cover-dimensions/   { pod_package_id, interior_page_count, unit } -> { width, height, unit }
 *   POST /validate-interior/  { source_url, pod_package_id } -> { id, status, errors, page_count }
 *   GET  /validate-interior/{id}/   status: VALIDATING | VALIDATED | NORMALIZING | NORMALIZED | ERROR
 *   POST /validate-cover/     { source_url, pod_package_id, interior_page_count } -> { id, status, errors }
 *   GET  /validate-cover/{id}/      status: NORMALIZING | NORMALIZED | ERROR
 *   POST /shipping-options/  { line_items, shipping_address: { country, state, ... }, currency } -> [{ level, cost_excl_tax, min/max_delivery_date, traceable, business_only }]
 *   POST /print-job-cost-calculations/ { line_items, shipping_address, shipping_option }
 *        -> { line_item_costs[], shipping_cost, fulfillment_cost, fees[], total_tax, total_cost_incl_tax, shipping_address.warnings/suggested_address }
 *   POST /print-jobs/  { contact_email, external_id, shipping_level, shipping_address,
 *        line_items: [{ external_id, title, quantity, printable_normalization: { pod_package_id, cover: { source_url }, interior: { source_url } } }] }
 *   GET  /print-jobs/{id}/  status.name: CREATED | UNPAID | PAYMENT_IN_PROGRESS | PRODUCTION_DELAYED | PRODUCTION_READY |
 *        IN_PRODUCTION | SHIPPED | DELIVERED | REJECTED | ERROR | CANCELED; tracking in line_items[].status.messages
 *   Webhooks: topic PRINT_JOB_STATUS_CHANGED, body { topic, data: <print job> }, signed with HMAC-SHA256 of the raw
 *        body using the API secret, in the Lulu-HMAC-SHA256 header.
 * A new print job stays UNPAID until paid in the Lulu portal, unless a card is on file in the Lulu account.
 * Rate limits: validate-interior 3/min, validate-cover 6/min, everything else 1200/min.
 * Files must be at public URLs (we use long-lived signed URLs).
 */
import crypto from "node:crypto";
import {
  WebhookSignatureError,
  type CoverDimensions,
  type CreateOrderInput,
  type FileCheck,
  type FileValidation,
  type PrintOrderState,
  type PrintOrderStatus,
  type PrintProvider,
  type PrintQuote,
  type ProductSpec,
  type ShippingAddress,
  type ShippingLevel,
  type ShippingOption,
  type ValidateFilesInput,
  SHIPPING_LEVELS,
} from "../print/types";
import { catalogAsProducts } from "../print/mock";
import { luluSpineWidthIn, spineTextAllowed } from "../../print/products";
import { PermanentProviderError } from "../types";

export const LULU_SANDBOX = "https://api.sandbox.lulu.com";
export const LULU_PRODUCTION = "https://api.lulu.com";

export interface LuluOptions {
  baseUrl: string;
  clientKey: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** How long to wait for a validation result before giving up. */
  validationTimeoutMs?: number;
  pollIntervalMs?: number;
}

const FINAL_INTERIOR = new Set(["VALIDATED", "NORMALIZED", "ERROR"]);
const FINAL_COVER = new Set(["NORMALIZED", "ERROR"]);

export class LuluPrintProvider implements PrintProvider {
  readonly name = "lulu";
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: LuluOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private base() {
    return this.opts.baseUrl.replace(/\/$/, "");
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.opts.clientKey}:${this.opts.clientSecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.base()}/auth/realms/glasstree/protocol/openid-connect/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const msg = `Lulu sign-in failed (HTTP ${res.status}). Check LULU_CLIENT_KEY, LULU_CLIENT_SECRET and that they belong to ${this.base().includes("sandbox") ? "the sandbox" : "production"}.`;
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new PermanentProviderError(msg);
      throw new Error(msg);
    }
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    // Refresh a minute early.
    this.token = { value: json.access_token, expiresAt: Date.now() + Math.max(30, (json.expires_in ?? 300) - 60) * 1000 };
    return json.access_token;
  }

  private async api<T>(method: "GET" | "POST", path: string, body?: unknown, attempt = 1): Promise<T> {
    const res = await this.fetchImpl(`${this.base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 5) {
      // Validation endpoints allow only a few calls per minute.
      await this.sleep(Math.min(60_000, 15_000 * attempt));
      return this.api<T>(method, path, body, attempt + 1);
    }
    if (res.status === 401 && attempt === 1) {
      this.token = null;
      return this.api<T>(method, path, body, attempt + 1);
    }
    const text = await res.text();
    if (!res.ok) {
      const msg = `Lulu ${method} ${path} failed (HTTP ${res.status}): ${text.slice(0, 400)}`;
      if (res.status >= 500 || res.status === 429) throw new Error(msg);
      throw new PermanentProviderError(msg);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async getProducts(): Promise<ProductSpec[]> {
    return catalogAsProducts(this.name);
  }

  async getCoverDimensions(product: ProductSpec, pageCount: number): Promise<CoverDimensions> {
    const r = await this.api<{ width: string; height: string; unit: string }>("POST", "/cover-dimensions/", {
      pod_package_id: product.sku,
      interior_page_count: pageCount,
      unit: "inch",
    });
    const toIn = (v: string) => {
      const n = Number(v);
      return r.unit === "pt" ? n / 72 : r.unit === "mm" ? n / 25.4 : n;
    };
    return {
      widthIn: Math.round(toIn(r.width) * 10000) / 10000,
      heightIn: Math.round(toIn(r.height) * 10000) / 10000,
      // Lulu returns the total size only; the spine comes from its published table/formula.
      spineIn: luluSpineWidthIn(product.binding, pageCount),
      spineTextAllowed: spineTextAllowed(pageCount),
    };
  }

  private async poll(kind: "interior" | "cover", id: number, onProgress?: (m: string) => void): Promise<FileCheck> {
    const deadline = Date.now() + (this.opts.validationTimeoutMs ?? 15 * 60_000);
    const final = kind === "interior" ? FINAL_INTERIOR : FINAL_COVER;
    for (;;) {
      const r = await this.api<{ status?: string | null; errors?: string[] | null; page_count?: string | number | null }>("GET", `/validate-${kind}/${id}/`);
      const status = r.status ?? "NULL";
      onProgress?.(`Lulu is checking the ${kind} file: ${status.toLowerCase()}`);
      if (final.has(status)) {
        return { status, errors: r.errors ?? [], pageCount: r.page_count != null ? Number(r.page_count) : undefined };
      }
      if (Date.now() > deadline) return { status: "TIMEOUT", errors: [`Lulu did not finish checking the ${kind} file in time.`] };
      await this.sleep(this.opts.pollIntervalMs ?? 5000);
    }
  }

  async validateFiles(input: ValidateFilesInput): Promise<FileValidation> {
    const { product, pageCount, onProgress } = input;
    onProgress?.("Sending the interior PDF to Lulu");
    const start = await this.api<{ id: number }>("POST", "/validate-interior/", { source_url: input.interiorUrl, pod_package_id: product.sku });
    const interior = await this.poll("interior", start.id, onProgress);
    onProgress?.("Sending the cover PDF to Lulu");
    const coverStart = await this.api<{ id: number }>("POST", "/validate-cover/", { source_url: input.coverUrl, pod_package_id: product.sku, interior_page_count: pageCount });
    const cover = await this.poll("cover", coverStart.id, onProgress);

    const problems: string[] = [];
    if (interior.status === "ERROR" || interior.status === "TIMEOUT") problems.push(...interior.errors.map((e) => `Interior: ${e}`));
    if (interior.pageCount != null && interior.pageCount !== pageCount) problems.push(`Interior: Lulu counted ${interior.pageCount} pages, we expected ${pageCount}.`);
    if (cover.status === "ERROR" || cover.status === "TIMEOUT") problems.push(...cover.errors.map((e) => `Cover: ${e}`));
    if (problems.length === 0 && (interior.status === "ERROR" || cover.status === "ERROR")) problems.push("Lulu rejected the files without saying why.");
    return { ok: problems.length === 0, problems, interior, cover };
  }

  private lineItems(product: ProductSpec, pageCount: number) {
    return [{ pod_package_id: product.sku, page_count: pageCount, quantity: 1 }];
  }

  async shippingOptions(product: ProductSpec, pageCount: number, address: ShippingAddress): Promise<ShippingOption[]> {
    const rows = await this.api<LuluShippingOption[]>("POST", "/shipping-options/", {
      line_items: this.lineItems(product, pageCount),
      shipping_address: {
        country: address.countryCode,
        state: address.stateCode || undefined,
        postcode: address.postcode,
        city: address.city,
        street1: address.street1,
        street2: address.street2 || undefined,
        name: address.name,
        phone_number: address.phone,
      },
      currency: "USD",
    });
    const best = new Map<ShippingLevel, ShippingOption>();
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r.business_only || !isLevel(r.level)) continue;
      const option: ShippingOption = {
        level: r.level,
        costExclTax: money(r.cost_excl_tax),
        currency: r.currency || "USD",
        arrivalMin: day(r.min_delivery_date),
        arrivalMax: day(r.max_delivery_date),
        traceable: r.traceable ?? undefined,
      };
      const prev = best.get(r.level);
      if (!prev || option.costExclTax < prev.costExclTax) best.set(r.level, option);
    }
    return SHIPPING_LEVELS.filter((l) => best.has(l)).map((l) => best.get(l)!);
  }

  async quote(product: ProductSpec, pageCount: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintQuote> {
    const r = await this.api<LuluCostCalculation>("POST", "/print-job-cost-calculations/", {
      line_items: this.lineItems(product, pageCount),
      shipping_address: luluAddress(address),
      shipping_option: level,
    });
    const printCost = (r.line_item_costs ?? []).reduce((sum, li) => sum + money(li.total_cost_incl_tax), 0);
    const fees = (r.fees ?? []).reduce((sum, f) => sum + money(f.total_cost_incl_tax), 0);
    const warnings = r.shipping_address?.warnings;
    const list = Array.isArray(warnings) ? warnings : warnings ? [warnings] : [];
    const suggested = r.shipping_address?.suggested_address;
    return {
      currency: r.currency || "USD",
      shippingLevel: level,
      printCost: round2(printCost),
      shippingCost: money(r.shipping_cost?.total_cost_incl_tax),
      fulfillmentCost: money(r.fulfillment_cost?.total_cost_incl_tax),
      fees: round2(fees),
      tax: money(r.total_tax),
      total: money(r.total_cost_incl_tax),
      addressWarnings: list.filter((w) => w?.message).map((w) => ({ message: String(w.message) })),
      suggestedAddress: suggested
        ? {
            street1: suggested.street1 ?? undefined,
            street2: suggested.street2 ?? undefined,
            city: suggested.city ?? undefined,
            stateCode: suggested.state_code ?? undefined,
            postcode: suggested.postcode != null ? String(suggested.postcode) : undefined,
            countryCode: suggested.country_code ?? undefined,
          }
        : undefined,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<PrintOrderState> {
    const job = await this.api<LuluPrintJob>("POST", "/print-jobs/", {
      contact_email: input.contactEmail,
      external_id: input.externalId,
      shipping_level: input.shippingLevel,
      shipping_address: luluAddress(input.address),
      line_items: [
        {
          external_id: input.externalId,
          title: input.title.slice(0, 255),
          quantity: 1,
          printable_normalization: {
            pod_package_id: input.product.sku,
            cover: { source_url: input.coverUrl },
            interior: { source_url: input.interiorUrl },
          },
        },
      ],
    });
    return mapLuluJob(job);
  }

  async getOrderStatus(providerOrderId: string): Promise<PrintOrderState> {
    return mapLuluJob(await this.api<LuluPrintJob>("GET", `/print-jobs/${encodeURIComponent(providerOrderId)}/`));
  }

  async findOrderByExternalId(externalId: string): Promise<PrintOrderState | null> {
    const r = await this.api<{ results?: Array<LuluPrintJob & { external_id?: string | null }> }>("GET", `/print-jobs/?search=${encodeURIComponent(externalId)}`);
    const job = (r.results ?? []).find((j) => j.external_id === externalId);
    return job ? mapLuluJob(job) : null;
  }

  /** Lulu-only setup helpers (used by `npm run lulu:check`). */
  async listWebhooks() {
    const r = await this.api<{ results?: Array<{ id: string; url: string; topics: string[]; is_active: boolean }> }>("GET", "/webhooks/");
    return r.results ?? [];
  }

  async subscribeWebhook(url: string) {
    const existing = (await this.listWebhooks()).find((w) => w.url === url);
    if (existing) return { ...existing, created: false };
    const w = await this.api<{ id: string; url: string; topics: string[]; is_active: boolean }>("POST", "/webhooks/", { topics: ["PRINT_JOB_STATUS_CHANGED"], url });
    return { ...w, created: true };
  }

  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<PrintOrderState | null> {
    const given = headers["lulu-hmac-sha256"] ?? "";
    if (!verifyLuluHmac(rawBody, given, this.opts.clientSecret)) throw new WebhookSignatureError();
    const payload = JSON.parse(rawBody) as { topic?: string; data?: LuluPrintJob };
    if (payload.topic !== "PRINT_JOB_STATUS_CHANGED" || !payload.data?.id) return null;
    return mapLuluJob(payload.data);
  }
}

interface LuluShippingOption {
  level: string;
  cost_excl_tax?: string | null;
  currency?: string;
  min_delivery_date?: string | null;
  max_delivery_date?: string | null;
  traceable?: boolean | null;
  business_only?: boolean | null;
}

interface LuluCost {
  total_cost_incl_tax?: string | null;
}

interface LuluCostCalculation {
  currency?: string;
  line_item_costs?: LuluCost[] | null;
  shipping_cost?: LuluCost | null;
  fulfillment_cost?: LuluCost | null;
  fees?: LuluCost[] | null;
  total_tax?: string | null;
  total_cost_incl_tax?: string | null;
  shipping_address?: {
    warnings?: Array<{ message?: string }> | { message?: string } | null;
    suggested_address?: { street1?: string | null; street2?: string | null; city?: string | null; state_code?: string | null; postcode?: string | number | null; country_code?: string | null } | null;
  } | null;
}

interface LuluStatusMessages {
  tracking_id?: string;
  tracking_urls?: string[];
  carrier_name?: string;
  [key: string]: unknown;
}

export interface LuluPrintJob {
  id: number | string;
  status?: { name?: string; message?: string | null; line_item_statuses?: Array<{ name?: string; messages?: LuluStatusMessages | null }> } | null;
  line_items?: Array<{ status?: { name?: string; messages?: LuluStatusMessages | null } | null; tracking_id?: string | null; tracking_urls?: string[] | null; carrier_name?: string | null }> | null;
  estimated_shipping_dates?: { arrival_min?: string | null; arrival_max?: string | null } | null;
}

function isLevel(level: string): level is ShippingLevel {
  return (SHIPPING_LEVELS as readonly string[]).includes(level);
}

function money(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function day(v: string | null | undefined): string | undefined {
  return v ? String(v).slice(0, 10) : undefined;
}

export function luluAddress(a: ShippingAddress) {
  return {
    name: a.name,
    street1: a.street1,
    street2: a.street2 || undefined,
    city: a.city,
    state_code: a.stateCode || undefined,
    postcode: a.postcode,
    country_code: a.countryCode,
    phone_number: a.phone,
    email: a.email || undefined,
  };
}

const LULU_STATUS: Record<string, PrintOrderStatus> = {
  CREATED: "created",
  UNPAID: "created",
  PAYMENT_IN_PROGRESS: "created",
  PRODUCTION_DELAYED: "created",
  PRODUCTION_READY: "created",
  IN_PRODUCTION: "in_production",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  REJECTED: "rejected",
  ERROR: "rejected",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
};

const WAITING_REASON: Record<string, string> = {
  CREATED: "Lulu has the order and is checking the files.",
  UNPAID:
    "Lulu is waiting to be paid for this print job. Add a card in your Lulu developer account so jobs are paid automatically, or pay this one in the Lulu portal.",
  PAYMENT_IN_PROGRESS: "Lulu is taking payment for the print job.",
  PRODUCTION_DELAYED: "Paid. Lulu starts printing after a short waiting period.",
  PRODUCTION_READY: "Lulu is about to start printing.",
};

/** Lulu print job -> our order state, with tracking and a plain-English reason. */
export function mapLuluJob(job: LuluPrintJob): PrintOrderState {
  const name = (job.status?.name ?? "CREATED").toUpperCase();
  const status = LULU_STATUS[name] ?? "created";
  const messages: LuluStatusMessages[] = [
    ...(job.status?.line_item_statuses ?? []).map((l) => l.messages ?? {}),
    ...(job.line_items ?? []).map((l) => ({ ...(l.status?.messages ?? {}), ...(l.tracking_id ? { tracking_id: l.tracking_id } : {}), ...(l.tracking_urls ? { tracking_urls: l.tracking_urls } : {}), ...(l.carrier_name ? { carrier_name: l.carrier_name } : {}) })),
  ];
  const tracking = messages.find((m) => m.tracking_id || m.tracking_urls?.length);
  let reason: string | undefined = WAITING_REASON[name];
  if (status === "rejected" || status === "cancelled") {
    const details = messages
      .flatMap((m) => Object.entries(m).filter(([k, v]) => !k.startsWith("tracking") && k !== "carrier_name" && typeof v === "string").map(([, v]) => v as string))
      .filter(Boolean);
    reason = [job.status?.message, ...details].filter(Boolean).join(" ") || (status === "rejected" ? "Lulu rejected the print job without giving a reason." : "Lulu cancelled the print job.");
  }
  return {
    providerOrderId: String(job.id),
    status,
    providerStatus: name,
    reason,
    trackingNumber: tracking?.tracking_id,
    trackingUrl: tracking?.tracking_urls?.[0],
    carrier: tracking?.carrier_name,
    estimatedArrival: day(job.estimated_shipping_dates?.arrival_max),
  };
}

/** Lulu signs the raw body with HMAC-SHA256 keyed by the API secret. Accepts hex or base64. */
export function verifyLuluHmac(rawBody: string, given: string, secret: string): boolean {
  if (!given || !secret) return false;
  const mac = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(Buffer.from(rawBody, "utf8")).digest();
  const candidates = [mac.toString("hex"), mac.toString("base64")];
  const g = given.trim();
  return candidates.some((c) => c.length === g.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(g)));
}
