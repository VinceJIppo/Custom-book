/**
 * S3-compatible storage for production: Cloudflare R2 (recommended) or AWS S3.
 * Checked against Cloudflare's R2 docs on 2026-11-21:
 * - @aws-sdk/client-s3 with region "auto" and endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 * - Presigned GET URLs for private objects, valid 1 second to 7 days.
 * - R2 encrypts every object at rest itself and does not accept the
 *   x-amz-server-side-encryption header, so none is sent.
 *
 * The bucket stays private (no public access, no r2.dev URL). Browsers and the
 * printer only ever get short-lived presigned links.
 */
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey, type SignedUrlOptions, type Storage, type StoredObjectMeta } from "./types";

/** R2 and S3 allow presigned links for at most 7 days. */
export const MAX_PRESIGN_SECONDS = 7 * 86400;

export interface S3Options {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  defaultTtlSeconds: number;
  /** For tests. */
  client?: Pick<S3Client, "send">;
  presign?: (key: string, ttl: number, opts: SignedUrlOptions) => Promise<string>;
}

function isNotFound(err: unknown) {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}

const STEP_SECONDS = 300;
function stepStart() {
  return new Date(Math.floor(Date.now() / 1000 / STEP_SECONDS) * STEP_SECONDS * 1000);
}
function stepOffset() {
  return Math.floor(Date.now() / 1000) % STEP_SECONDS;
}

export class S3Storage implements Storage {
  readonly driver = "s3";
  private readonly client: Pick<S3Client, "send">;
  private readonly realClient: S3Client | null;

  constructor(private readonly opts: S3Options) {
    this.realClient = opts.client
      ? null
      : new S3Client({
          region: opts.region || "auto",
          endpoint: opts.endpoint || undefined,
          credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
        });
    this.client = opts.client ?? this.realClient!;
  }

  async put(key: string, data: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async get(key: string): Promise<{ data: Buffer; meta: StoredObjectMeta } | null> {
    assertSafeKey(key);
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      const bytes = await r.Body!.transformToByteArray();
      return { data: Buffer.from(bytes), meta: { contentType: r.ContentType ?? "application/octet-stream", size: bytes.length } };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async exists(key: string) {
    assertSafeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  /** Removes every object under a prefix (used by "delete this child and everything"). */
  async deletePrefix(prefix: string) {
    assertSafeKey(prefix);
    if (!prefix.endsWith("/")) throw new Error("deletePrefix needs a folder-style prefix ending in /");
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.opts.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
      if (keys.length) {
        const r = await this.client.send(new DeleteObjectsCommand({ Bucket: this.opts.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
        if (r.Errors?.length) throw new Error(`Could not delete ${r.Errors.length} file(s) under ${prefix}`);
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  /** A presigned link (always absolute). downloadName makes the browser save the file. */
  async signedUrl(key: string, ttlSeconds?: number, opts: SignedUrlOptions = {}) {
    assertSafeKey(key);
    const ttl = Math.max(1, Math.min(MAX_PRESIGN_SECONDS, ttlSeconds ?? this.opts.defaultTtlSeconds));
    if (this.opts.presign) return this.opts.presign(key, ttl, opts);
    const name = opts.downloadName?.replace(/[^A-Za-z0-9 ._-]/g, "");
    return getSignedUrl(
      this.realClient!,
      new GetObjectCommand({ Bucket: this.opts.bucket, Key: key, ...(name ? { ResponseContentDisposition: `attachment; filename="${name}"` } : {}) }),
      // Sign as of the start of the current 5-minute step, so repeated requests get the
      // same link (and browsers reuse the download); the expiry is extended to match.
      { expiresIn: Math.min(MAX_PRESIGN_SECONDS, ttl + stepOffset()), signingDate: stepStart() },
    );
  }
}
