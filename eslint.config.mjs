import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Provider SDKs may only be imported inside their own adapter folder under
 * lib/providers. Everything else talks to the interfaces in lib/providers.
 */
const PROVIDER_SDKS = [
  { name: "@anthropic-ai/sdk", folder: "lib/providers/story/anthropic" },
  { name: "openai", folder: "lib/providers/image/openai" },
  { name: "@google/genai", folder: "lib/providers/image/gemini" },
  { name: "replicate", folder: "lib/providers/upscale/replicate" },
  { name: "stripe", folder: "lib/payments/stripe" },
];

const sdkPatterns = PROVIDER_SDKS.map((s) => ({
  group: [s.name, `${s.name}/*`],
  message: `Import ${s.name} only inside ${s.folder}. App code must use the provider interfaces.`,
}));

const config = [
  { ignores: [".next/**", "node_modules/**", ".data/**", "next-env.d.ts", "test-results/**", "playwright-report/**"] },
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: sdkPatterns }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  ...PROVIDER_SDKS.map((s) => ({
    files: [`${s.folder}/**/*.ts`],
    rules: { "no-restricted-imports": "off" },
  })),
];

export default config;
