import { describe, expect, it } from "vitest";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Storage, MAX_PRESIGN_SECONDS } from "@/lib/storage/s3";

/** An in-memory stand-in for an S3/R2 bucket. */
function fakeBucket() {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const sent: unknown[] = [];
  const client = {
    async send(cmd: unknown) {
      sent.push(cmd);
      if (cmd instanceof PutObjectCommand) {
        objects.set(cmd.input.Key!, { body: cmd.input.Body as Buffer, type: cmd.input.ContentType! });
        return {};
      }
      if (cmd instanceof GetObjectCommand || cmd instanceof HeadObjectCommand) {
        const o = objects.get(cmd.input.Key!);
        if (!o) throw Object.assign(new Error("missing"), { name: cmd instanceof GetObjectCommand ? "NoSuchKey" : "NotFound" });
        return { ContentType: o.type, Body: { transformToByteArray: async () => new Uint8Array(o.body) } };
      }
      if (cmd instanceof ListObjectsV2Command) {
        // Two per page, to exercise pagination. Like S3, the token is the last key returned.
        const all = [...objects.keys()].filter((k) => k.startsWith(cmd.input.Prefix!) && (!cmd.input.ContinuationToken || k > cmd.input.ContinuationToken)).sort();
        const page = all.slice(0, 2);
        return { Contents: page.map((Key) => ({ Key })), IsTruncated: all.length > 2, NextContinuationToken: page[page.length - 1] };
      }
      if (cmd instanceof DeleteObjectsCommand) {
        for (const o of cmd.input.Delete!.Objects!) objects.delete(o.Key!);
        return { Errors: [] };
      }
      objects.delete((cmd as { input: { Key: string } }).input.Key);
      return {};
    },
  };
  return { client, objects, sent };
}

const opts = { bucket: "storystar", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret", defaultTtlSeconds: 300 };

describe("S3 / R2 storage driver", () => {
  it("puts, gets, checks and deletes objects in the private bucket", async () => {
    const { client, sent } = fakeBucket();
    const s = new S3Storage({ ...opts, client });
    await s.put("users/u1/children/c1/photos/p.jpg", Buffer.from("jpeg"), "image/jpeg");
    const put = sent[0] as PutObjectCommand;
    expect(put.input).toMatchObject({ Bucket: "storystar", Key: "users/u1/children/c1/photos/p.jpg", ContentType: "image/jpeg" });
    // R2 rejects the S3 encryption header (it encrypts at rest itself).
    expect(put.input.ServerSideEncryption).toBeUndefined();
    const got = await s.get("users/u1/children/c1/photos/p.jpg");
    expect(got?.data.toString()).toBe("jpeg");
    expect(got?.meta).toEqual({ contentType: "image/jpeg", size: 4 });
    expect(await s.exists("users/u1/children/c1/photos/p.jpg")).toBe(true);
    expect(await s.get("users/u1/missing.jpg")).toBeNull();
    expect(await s.exists("users/u1/missing.jpg")).toBe(false);
    await s.delete("users/u1/children/c1/photos/p.jpg");
    expect(await s.exists("users/u1/children/c1/photos/p.jpg")).toBe(false);
  });

  it("deletes everything under a child's prefix, across pages, and nothing else", async () => {
    const { client, objects } = fakeBucket();
    const s = new S3Storage({ ...opts, client });
    for (const k of ["a.jpg", "b.jpg", "books/x/p1.png", "books/x/p2.png", "sheets/s.png"]) await s.put(`users/u1/children/c1/${k}`, Buffer.from("x"), "image/png");
    await s.put("users/u1/children/c2/keep.jpg", Buffer.from("x"), "image/jpeg");
    expect(await s.deletePrefix("users/u1/children/c1/")).toBe(5);
    expect([...objects.keys()]).toEqual(["users/u1/children/c2/keep.jpg"]);
    await expect(s.deletePrefix("users/u1/children/c")).rejects.toThrow(/ending in \//);
  });

  it("rejects unsafe keys", async () => {
    const s = new S3Storage({ ...opts, client: fakeBucket().client });
    await expect(s.put("../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });

  it("makes real presigned R2 links that expire (offline signing)", async () => {
    const s = new S3Storage({ ...opts, endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com", region: "auto" });
    const url = new URL(await s.signedUrl("users/u1/books/b/exports/e-interior.pdf", 600, { downloadName: "Oliver's book.pdf" }));
    // Bucket-in-hostname form, as in R2's own presigned URL example.
    expect(url.host).toBe("storystar.0123456789abcdef.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/users/u1/books/b/exports/e-interior.pdf");
    // At least the 10 minutes asked for, rounded to a 5-minute step so repeat requests reuse the link.
    const expires = Number(url.searchParams.get("X-Amz-Expires"));
    expect(expires).toBeGreaterThanOrEqual(600);
    expect(expires).toBeLessThan(900);
    expect(await s.signedUrl("users/u1/books/b/exports/e-interior.pdf", 600, { downloadName: "Oliver's book.pdf" })).toBe(url.toString());
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="Olivers book.pdf"');
    // Longer requests are capped at the 7-day maximum.
    const long = new URL(await s.signedUrl("users/u1/x.pdf", 30 * 86400));
    expect(long.searchParams.get("X-Amz-Expires")).toBe(String(MAX_PRESIGN_SECONDS));
  });
});
