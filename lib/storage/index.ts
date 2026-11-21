import { getConfig } from "../config";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { Storage } from "./types";

let instance: Storage | null = null;

export function getStorage(): Storage {
  if (instance) return instance;
  const c = getConfig();
  instance =
    c.STORAGE_DRIVER === "s3"
      ? new S3Storage()
      : new LocalStorage(c.STORAGE_LOCAL_DIR, c.storageSigningSecret, c.storageEncryptionKey, "", c.SIGNED_URL_TTL_SECONDS, c.PUBLIC_BASE_URL ?? c.APP_URL);
  return instance;
}

/** Storage key helpers. Everything about a child lives under one prefix. */
export const keys = {
  childPrefix: (userId: string, childId: string) => `users/${userId}/children/${childId}/`,
  bookPrefix: (userId: string, childId: string, bookId: string) => `users/${userId}/children/${childId}/books/${bookId}/`,
  pageImage: (userId: string, childId: string, bookId: string, pageId: string, version: number, ext: string) =>
    `users/${userId}/children/${childId}/books/${bookId}/pages/${pageId}-v${version}.${ext}`,
  photo: (userId: string, childId: string, photoId: string) => `users/${userId}/children/${childId}/photos/${photoId}.jpg`,
  sheetImage: (userId: string, childId: string, sheetId: string, i: number, ext: string) => `users/${userId}/children/${childId}/sheets/${sheetId}-${i}.${ext}`,
  pageWorking: (userId: string, childId: string, bookId: string, pageId: string, version: number, ext: string) =>
    `users/${userId}/children/${childId}/books/${bookId}/pages/${pageId}-v${version}-work.${ext}`,
  exportFile: (userId: string, childId: string, bookId: string, exportId: string, name: "interior" | "cover") =>
    `users/${userId}/children/${childId}/books/${bookId}/exports/${exportId}-${name}.pdf`,
  /** Frozen copy of the exact PDFs sent to the printer for an order (n = send attempt). */
  orderFile: (userId: string, childId: string, bookId: string, orderId: string, name: "interior" | "cover", n: number) =>
    `users/${userId}/children/${childId}/books/${bookId}/orders/${orderId}-${n}-${name}.pdf`,
  coverImage: (userId: string, childId: string, bookId: string, version: number, ext: string) =>
    `users/${userId}/children/${childId}/books/${bookId}/cover-v${version}.${ext}`,
};

export type { Storage } from "./types";
