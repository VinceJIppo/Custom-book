import { describe, expect, it } from "vitest";
import { S3Storage } from "@/lib/storage/s3";

/** A tiny in-memory bucket that answers the commands the mover uses. */
function fakeBucket(keys: string[]) {
  const store = new Map(keys.map((k) => [k, Buffer.from(k)]));
  const client = {
    async send(cmd: { constructor: { name: string }; input: Record<string, string> }) {
      const i = cmd.input;
      switch (cmd.constructor.name) {
        case "ListObjectsV2Command": {
          const hits = [...store.keys()].filter((k) => k.startsWith(i.Prefix));
          return { Contents: hits.map((Key) => ({ Key })), KeyCount: hits.length, IsTruncated: false };
        }
        case "HeadObjectCommand":
          if (!store.has(i.Key)) throw Object.assign(new Error("nf"), { name: "NotFound" });
          return {};
        case "CopyObjectCommand": {
          const src = decodeURIComponent(i.CopySource.slice(i.Bucket.length + 1));
          store.set(i.Key, store.get(src)!);
          return {};
        }
        case "DeleteObjectCommand":
          store.delete(i.Key);
          return {};
      }
      throw new Error(`unexpected ${cmd.constructor.name}`);
    },
  };
  return { store, storage: new S3Storage({ bucket: "storystar", accessKeyId: "a", secretAccessKey: "b", defaultTtlSeconds: 60, client: client as never }) };
}

describe("files saved under the wrong folder", () => {
  it("counts them and moves them back without overwriting newer files", async () => {
    const { store, storage } = fakeBucket(["storystar/users/u1/children/c1/sheets/s-0.png", "storystar/users/u1/children/c1/photos/p.jpg", "users/u1/children/c1/photos/p.jpg"]);
    expect((await storage.countMisplaced()).count).toBe(2);
    expect(await storage.moveMisplaced()).toEqual({ moved: 1, skipped: 1 });
    expect([...store.keys()].sort()).toEqual(["users/u1/children/c1/photos/p.jpg", "users/u1/children/c1/sheets/s-0.png"]);
    expect(store.get("users/u1/children/c1/photos/p.jpg")!.toString()).toBe("users/u1/children/c1/photos/p.jpg");
    expect((await storage.countMisplaced()).count).toBe(0);
  });
});
