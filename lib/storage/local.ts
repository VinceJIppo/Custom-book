import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, type SignedUrlOptions, type Storage, type StoredObjectMeta } from "./types";
import { decrypt, encrypt, safeEqual, signParts } from "./crypto";

/**
 * Local filesystem driver for development. Objects are encrypted at rest and
 * served only through /api/files with an HMAC signature and expiry.
 */
export class LocalStorage implements Storage {
  readonly driver = "local";

  constructor(
    private readonly rootDir: string,
    private readonly signingSecret: string,
    private readonly encryptionKey: string,
    private readonly appUrl: string,
    private readonly defaultTtl: number,
    private readonly publicUrl: string = "",
  ) {}

  private filePath(key: string) {
    assertSafeKey(key);
    return path.join(path.resolve(this.rootDir), key);
  }

  async put(key: string, data: Buffer, contentType: string) {
    const p = this.filePath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const meta: StoredObjectMeta = { contentType, size: data.length };
    await fs.writeFile(`${p}.bin`, encrypt(data, this.encryptionKey));
    await fs.writeFile(`${p}.meta.json`, JSON.stringify(meta));
  }

  async get(key: string) {
    const p = this.filePath(key);
    try {
      const [blob, metaRaw] = await Promise.all([fs.readFile(`${p}.bin`), fs.readFile(`${p}.meta.json`, "utf8")]);
      return { data: decrypt(blob, this.encryptionKey), meta: JSON.parse(metaRaw) as StoredObjectMeta };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async exists(key: string) {
    try {
      await fs.access(`${this.filePath(key)}.bin`);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string) {
    const p = this.filePath(key);
    await Promise.all([fs.rm(`${p}.bin`, { force: true }), fs.rm(`${p}.meta.json`, { force: true })]);
  }

  async deletePrefix(prefix: string) {
    assertSafeKey(prefix.replace(/\/$/, ""));
    const dir = path.join(path.resolve(this.rootDir), prefix);
    let count = 0;
    try {
      const entries = await fs.readdir(dir, { recursive: true });
      count = entries.filter((e) => String(e).endsWith(".bin")).length;
    } catch {
      return 0;
    }
    await fs.rm(dir, { recursive: true, force: true });
    return count;
  }

  async signedUrl(key: string, ttlSeconds?: number, opts: SignedUrlOptions = {}) {
    assertSafeKey(key);
    // Round the expiry up to a 5-minute step so the same file gets the same link
    // for a few minutes (browsers can then reuse it instead of downloading again).
    const exp = Math.ceil((Math.floor(Date.now() / 1000) + (ttlSeconds ?? this.defaultTtl)) / 300) * 300;
    const sig = signParts([key, String(exp)], this.signingSecret);
    const base = (opts.absolute ? this.publicUrl || this.appUrl : this.appUrl).replace(/\/$/, "");
    const dl = opts.downloadName ? `&dl=${encodeURIComponent(opts.downloadName.replace(/[^A-Za-z0-9 ._-]/g, ""))}` : "";
    return `${base}/api/files/${key}?exp=${exp}&sig=${sig}${dl}`;
  }

  /** Used by the /api/files route. */
  verify(key: string, exp: string | null, sig: string | null): boolean {
    if (!exp || !sig) return false;
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return false;
    return safeEqual(signParts([key, exp], this.signingSecret), sig);
  }
}
