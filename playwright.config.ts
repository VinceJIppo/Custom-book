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
    // Tests make many books; lift the daily caps for the server Playwright starts.
    // (A dev server you started yourself keeps the caps from .env.local.)
    // AUTO_PRINT_FILES off: the print test makes the files itself (automatic ones have a unit test).
    env: { ANTHROPIC_API_KEY: "", STORYSTAR_ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "", OPENAI_API_KEY: "", DAILY_BOOK_CAP: "1000", DAILY_COST_CAP_USD: "1000", STORY_REVIEW: "false", AUTO_PRINT_FILES: "false" },
  },
});
