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
      : new LocalStorage(c.STORAGE_LOCAL_DIR, c.storageSigningSecret, c.storageEncryptionKey, "", c.SIGNED_URL_TTL_SECONDS);
  return instance;
}

/** Storage key helpers. Everything about a child lives under one prefix. */
export const keys = {
  childPrefix: (userId: string, childId: string) => `users/${userId}/children/${childId}/`,
  bookPrefix: (userId: string, childId: string, bookId: string) => `users/${userId}/children/${childId}/books/${bookId}/`,
  pageImage: (userId: string, childId: string, bookId: string, pageId: string, version: number, ext: string) =>
    `users/${userId}/children/${childId}/books/${bookId}/pages/${pageId}-v${version}.${ext}`,
  coverImage: (userId: string, childId: string, bookId: string, version: number, ext: string) =>
    `users/${userId}/children/${childId}/books/${bookId}/cover-v${version}.${ext}`,
};

export type { Storage } from "./types";
