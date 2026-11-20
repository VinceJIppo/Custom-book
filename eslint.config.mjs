import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Provider SDKs may only be imported inside their own adapter folder under
 * lib/providers. Everything else talks to the interfaces in lib/providers.
 */
const PROVIDER_SDKS = [
  { name: "@anthropic-ai/sdk", folder: "lib/providers/anthropic" },
  { name: "openai", folder: "lib/providers/openai" },
  { name: "@google/genai", folder: "lib/providers/gemini" },
  { name: "replicate", folder: "lib/providers/replicate" },
  { name: "stripe", folder: "lib/payments/stripe" },
];

// Exact package names, plus subpaths for scoped packages (a bare "openai/*"
// pattern would also match our own lib/providers/openai folder).
const sdkPaths = PROVIDER_SDKS.map((s) => ({
  name: s.name,
  message: `Import ${s.name} only inside ${s.folder}. App code must use the provider interfaces.`,
}));
const sdkPatterns = PROVIDER_SDKS.filter((s) => s.name.startsWith("@")).map((s) => ({
  group: [`${s.name}/*`],
  message: `Import ${s.name} only inside ${s.folder}. App code must use the provider interfaces.`,
}));

const config = [
  { ignores: [".next/**", "node_modules/**", ".data/**", "next-env.d.ts", "test-results/**", "playwright-report/**"] },
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { paths: sdkPaths, patterns: sdkPatterns }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  ...PROVIDER_SDKS.map((s) => ({
    files: [`${s.folder}/**/*.ts`],
    rules: { "no-restricted-imports": "off" },
  })),
];

export default config;
