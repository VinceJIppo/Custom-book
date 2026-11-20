import crypto from "node:crypto";

/** AES-256-GCM encryption for objects at rest. Layout: [12-byte IV][16-byte tag][ciphertext]. */
function keyFrom(secret: string) {
  return crypto.createHash("sha256").update(`storystar-at-rest:${secret}`).digest();
}

export function encrypt(plain: Buffer, secret: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(blob: Buffer, secret: string): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

export function signParts(parts: string[], secret: string): string {
  return crypto.createHmac("sha256", secret).update(parts.join("\n")).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
