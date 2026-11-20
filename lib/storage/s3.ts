import type { Storage } from "./types";

/**
 * S3-compatible driver (AWS S3 or Cloudflare R2). Implemented in Phase 5 with
 * server-side encryption and presigned GET URLs. Kept here so config and call
 * sites already target the interface.
 */
export class S3Storage implements Storage {
  readonly driver = "s3";
  private notYet(): never {
    throw new Error("The S3 storage driver is not implemented yet (Phase 5). Set STORAGE_DRIVER=local.");
  }
  async put(): Promise<void> {
    this.notYet();
  }
  async get(): Promise<null> {
    this.notYet();
  }
  async exists(): Promise<boolean> {
    this.notYet();
  }
  async delete(): Promise<void> {
    this.notYet();
  }
  async deletePrefix(): Promise<number> {
    this.notYet();
  }
  async signedUrl(): Promise<string> {
    this.notYet();
  }
}
