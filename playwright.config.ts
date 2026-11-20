import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke test of the Phase 1 acceptance criteria with zero API keys.
 * Starts web + worker with `npm run dev` unless something is already on :3000.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3000", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/welcome",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
