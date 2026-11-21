import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "file:./.data/test.db",
      STORAGE_LOCAL_DIR: ".data/test-storage",
      STORAGE_SIGNING_SECRET: "test-signing-secret-test-signing-secret",
      STORAGE_ENCRYPTION_KEY: "test-encryption-key-test-encryption-key",
      STORY_PROVIDER: "mock",
      // Allowances are tested on their own (tests/allowance.test.ts); other tests make many books.
      ALLOWANCES_ENABLED: "false",
      // Most tests make whole books in one go and check the automatic redraw; both have their own tests.
      STORY_REVIEW: "false",
      PICTURE_CHECK: "redraw",
      BATCH_POLL_SECONDS: "0",
    },
  },
});
