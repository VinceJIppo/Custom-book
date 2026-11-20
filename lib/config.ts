import { z } from "zod";

/**
 * All runtime configuration, validated once. Every provider choice defaults to
 * "auto": the real provider when its key is present, otherwise the Mock.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("file:./.data/dev.db"),

  SINGLE_USER_EMAIL: z.string().email().default("parent@storystar.local"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/storage"),
  STORAGE_SIGNING_SECRET: z.string().optional(),
  STORAGE_ENCRYPTION_KEY: z.string().optional(),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  STORY_PROVIDER: z.enum(["auto", "mock", "anthropic"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  STORY_MODEL: z.string().default("claude-sonnet-5-5"),
  STORY_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  STORY_FALLBACKS: bool.default(true),

  IMAGE_PROVIDER: z.enum(["auto", "mock"]).default("auto"),
  UPSCALER: z.enum(["auto", "mock"]).default("auto"),
  PRINT_PROVIDER: z.enum(["auto", "mock"]).default("auto"),
  MODERATION_PROVIDER: z.enum(["auto", "mock"]).default("auto"),

  DAILY_COST_CAP_USD: z.coerce.number().min(0).default(10),
  DAILY_BOOK_CAP: z.coerce.number().int().min(0).default(10),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(3),
  JOB_LEASE_SECONDS: z.coerce.number().int().min(10).default(300),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  storageSigningSecret: string;
  storageEncryptionKey: string;
};

let cached: AppConfig | null = null;

const DEV_SIGNING_SECRET = "dev-only-signing-secret-change-me-in-env-local";
const DEV_ENCRYPTION_KEY = "dev-only-encryption-key-change-me-in-env-local";

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";
  if (isProd && (!env.STORAGE_SIGNING_SECRET || !env.STORAGE_ENCRYPTION_KEY)) {
    throw new Error("STORAGE_SIGNING_SECRET and STORAGE_ENCRYPTION_KEY are required in production.");
  }
  cached = {
    ...env,
    storageSigningSecret: env.STORAGE_SIGNING_SECRET || DEV_SIGNING_SECRET,
    storageEncryptionKey: env.STORAGE_ENCRYPTION_KEY || DEV_ENCRYPTION_KEY,
  };
  return cached;
}

/** For tests only. */
export function resetConfigCache() {
  cached = null;
}
