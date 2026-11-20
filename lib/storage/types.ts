export interface StoredObjectMeta {
  contentType: string;
  size: number;
}

/**
 * Private object storage. Nothing is ever public: callers get short-lived
 * signed URLs from `signedUrl`. Keys are path-like and scoped per user/child so a
 * whole child can be removed with `deletePrefix`.
 */
export interface Storage {
  readonly driver: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; meta: StoredObjectMeta } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  /**
   * Short-lived URL a browser (or a print provider) can fetch.
   * absolute: prefix with the public base URL. downloadName: serve as an attachment.
   */
  signedUrl(key: string, ttlSeconds?: number, opts?: SignedUrlOptions): Promise<string>;
}

export interface SignedUrlOptions {
  absolute?: boolean;
  downloadName?: string;
}

export function assertSafeKey(key: string) {
  if (!key || key.length > 512 || key.startsWith("/") || key.includes("..") || key.includes("\\") || /[^A-Za-z0-9/_.-]/.test(key)) {
    throw new Error("Invalid storage key");
  }
}
