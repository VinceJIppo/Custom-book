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
  /**
   * single: no sign-in, everyone is SINGLE_USER_EMAIL (your own computer only).
   * email: magic-link sign-in; each parent sees only their own data.
   * auto: email in production, single otherwise.
   */
  AUTH_MODE: z.enum(["auto", "single", "email"]).default("auto"),
  /** How long a sign-in lasts on a browser. */
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Email: auto = Resend when RESEND_API_KEY is set, else mock (links appear on the sign-in page in development). */
  EMAIL_PROVIDER: z.enum(["auto", "mock", "resend"]).default("auto"),
  RESEND_API_KEY: z.string().optional(),
  /** Sender, e.g. "StoryStar <hello@yourdomain.com>" (the domain must be verified in Resend). */
  EMAIL_FROM: z.string().default("StoryStar <onboarding@resend.dev>"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/storage"),
  STORAGE_SIGNING_SECRET: z.string().optional(),
  STORAGE_ENCRYPTION_KEY: z.string().optional(),
  SIGNED_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  STORY_PROVIDER: z.enum(["auto", "mock", "anthropic"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  STORY_MODEL: z.string().default("claude-sonnet-5-5"),
  STORY_EFFORT: z
    .enum(["low", "medium", "high", "xhigh", "max"])
    .default("high"),
  STORY_FALLBACKS: bool.default(true),

  IMAGE_PROVIDER: z.enum(["auto", "mock", "gemini", "openai"]).default("auto"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-nano-banana-2.1"),
  /** Output size for page art: auto picks per layout from print pixels. */
  GEMINI_PAGE_SIZE: z.enum(["auto", "1K", "2K", "4K"]).default("2K"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2.6-sunburst"),
  OPENAI_IMAGE_QUALITY: z
    .enum(["low", "medium", "high", "xhigh", "max", "auto"])
    .default("high"),
  UPSCALER: z.enum(["auto", "mock", "sharp"]).default("auto"),

  VISION_PROVIDER: z.enum(["auto", "mock", "anthropic"]).default("auto"),
  VISION_MODEL: z.string().default("claude-sonnet-5-5"),
  VISION_EFFORT: z
    .enum(["low", "medium", "high", "xhigh", "max"])
    .default("medium"),
  /** Compare each page with the character sheet and its words. */
  CONSISTENCY_QA: bool.default(true),
  /**
   * What a failed picture check does. "flag" (cheaper): keep the picture and show the parent a
   * note so they can redraw it if they want. "redraw": redraw once automatically, then flag.
   */
  PICTURE_CHECK: z.enum(["flag", "redraw"]).default("flag"),
  /** Parents read and approve the story before any pictures are drawn (and paid for). */
  STORY_REVIEW: bool.default(true),
  /** Make the hardcover print files as soon as a book is finished, so parents can order straight away. */
  AUTO_PRINT_FILES: bool.default(true),
  /** How often to check on an overnight (batch) picture job, in seconds. */
  BATCH_POLL_SECONDS: z.coerce.number().int().min(0).default(300),
  MODERATION_PROVIDER: z.enum(["auto", "mock", "anthropic"]).default("auto"),
  PRINT_PROVIDER: z.enum(["auto", "mock", "lulu"]).default("auto"),
  LULU_API_BASE: z.string().url().default("https://api.sandbox.lulu.com"),
  LULU_CLIENT_KEY: z.string().optional(),
  LULU_CLIENT_SECRET: z.string().optional(),
  /**
   * Public base URL a print provider can download PDFs from (Lulu fetches files
   * itself). Defaults to APP_URL; on a laptop use a tunnel URL.
   */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** Lifetime of signed links handed to a print provider (PDFs only, never photos). */
  PRINT_FILE_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(7 * 86400)
    .default(6 * 3600),

  /** Mock printer: seconds between status steps (created, printing, shipped, delivered). */
  MOCK_PRINT_STEP_SECONDS: z.coerce.number().int().min(1).default(60),

  /** Payments: auto = Stripe when STRIPE_SECRET_KEY is set, else the offline mock checkout. */
  PAYMENT_PROVIDER: z.enum(["auto", "mock", "stripe"]).default("auto"),
  STRIPE_SECRET_KEY: z.string().optional(),
  /** Signing secret of the Stripe webhook endpoint (whsec_...). */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Safety switch: live Stripe keys and Lulu production are refused unless this
   * is true, so a test setup can never charge a real card or print a real book.
   */
  ALLOW_LIVE_ORDERS: bool.default(false),
  /** Your margin on top of the printer's price: a percentage plus a flat amount (USD). */
  ORDER_MARGIN_PERCENT: z.coerce.number().min(0).max(500).default(0),
  ORDER_MARGIN_FLAT_USD: z.coerce.number().min(0).max(1000).default(0),
  /** Add the card processing fee (2.9% + $0.30) to the price so it doesn't come out of your pocket. */
  ORDER_COVER_CARD_FEES: bool.default(true),
  /** Email the printer contacts about print problems (defaults to the parent's email). */
  ORDER_CONTACT_EMAIL: z.string().email().optional(),
  /** Comma-separated emails that can see the admin orders page (single-user mode: that user). */
  ADMIN_EMAILS: z.string().optional(),
  /** How often the worker checks open orders with the printer (webhooks are faster). */
  ORDER_POLL_MINUTES: z.coerce.number().int().min(1).default(30),

  CHARACTER_SHEET_OPTIONS: z.coerce.number().int().min(1).max(4).default(3),
  /** How many times a parent may generate a new set of character options. */
  CHARACTER_SHEET_MAX_ROUNDS: z.coerce.number().int().min(1).max(10).default(3),

  /** Rewards: limit books, characters and edits by tier (first-time vs repeat customers). Admins are unlimited. */
  ALLOWANCES_ENABLED: bool.default(true),
  /**
   * New accounts wait for an admin (ADMIN_EMAILS) to approve them before they can make
   * anything. Admins get an email for each request. Protects the welcome credits from
   * someone creating many accounts.
   */
  NEW_ACCOUNT_APPROVAL: bool.default(false),
  /** Usage credits: every Claude and Gemini call is charged to the user's balance at its actual cost. */
  CREDITS_ENABLED: bool.default(true),
  /** Free credits every new account starts with (USD). */
  CREDIT_SIGNUP_USD: z.coerce.number().min(0).default(5),
  /** Credits added for every printed book bought (USD). */
  CREDIT_PER_BOOK_USD: z.coerce.number().min(0).default(10),
  /** Credits expire this many months after they are added. */
  CREDIT_EXPIRY_MONTHS: z.coerce.number().int().min(1).max(60).default(6),
  /** Credits can pay toward a book at checkout as long as this much stays in the account (USD). */
  CREDIT_REDEEM_KEEP_USD: z.coerce.number().min(0).default(5),
  /** Credit packs on sale, in USD, comma-separated. */
  CREDIT_PACKS_USD: z.string().default("5,10,25"),
  DAILY_COST_CAP_USD: z.coerce.number().min(0).default(10),
  DAILY_BOOK_CAP: z.coerce.number().int().min(0).default(10),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(3),
  JOB_LEASE_SECONDS: z.coerce.number().int().min(10).default(300),
  /** Most pictures one picture job may draw across all its tries (each one is billed). */
  MAX_DRAWS_PER_PICTURE: z.coerce.number().int().min(1).max(20).default(4),
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
  // A blank value (e.g. "KEY=" copied from .env.example) means "not set".
  const env0 = Object.fromEntries(
    Object.entries(process.env).filter(
      ([, v]) => v !== undefined && v.trim() !== "",
    ),
  );
  const parsed = EnvSchema.safeParse(env0);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";
  // The production check runs when the app starts, not while `next build` prerenders pages.
  if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
    const problems: string[] = [];
    if (
      env.STORAGE_DRIVER === "local" &&
      (!env.STORAGE_SIGNING_SECRET || !env.STORAGE_ENCRYPTION_KEY)
    )
      problems.push(
        "STORAGE_SIGNING_SECRET and STORAGE_ENCRYPTION_KEY are required with local storage.",
      );
    if (
      env.STORAGE_DRIVER === "s3" &&
      (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
    )
      problems.push(
        "STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2).",
      );
    if (env.APP_URL.startsWith("http://localhost"))
      problems.push(
        "APP_URL must be the site's public https address (it goes into sign-in links and checkout).",
      );
    if (problems.length)
      throw new Error(
        `Production configuration is incomplete:\n  ${problems.join("\n  ")}`,
      );
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
