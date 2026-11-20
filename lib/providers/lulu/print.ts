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
 * Rate limits: validate-interior 3/min, validate-cover 6/min, everything else 1200/min.
 * Files must be at public URLs (we use long-lived signed URLs).
 */
import type { CoverDimensions, FileCheck, FileValidation, PrintOrderState, PrintProvider, PrintQuote, ProductSpec, ValidateFilesInput } from "../print/types";
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

  private phase4(): never {
    throw new Error("Ordering through Lulu arrives in Phase 4.");
  }
  async quote(): Promise<PrintQuote> {
    this.phase4();
  }
  async createOrder(): Promise<PrintOrderState> {
    this.phase4();
  }
  async getOrderStatus(): Promise<PrintOrderState> {
    this.phase4();
  }
  async handleWebhook(): Promise<PrintOrderState | null> {
    this.phase4();
  }
}
