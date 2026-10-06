import { BRAND } from "@/config/brand";

/**
 * Environment access and the app mode.
 *
 * APP_MODE decides how much is real:
 *  - demo: every external service may be simulated; no real money (the default with no keys)
 *  - test: Stripe test keys; other services may still be simulated, and are labelled as such
 *  - live: real money. Every service must be real and every launch gate signed off, or
 *          the server refuses to start (see src/lib/readiness.ts).
 * A Stripe key on its own never turns live mode on.
 */

export type AppMode = "demo" | "test" | "live";

const forceMock = process.env.MOCK_MODE === "true";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";

function resolveMode(): AppMode {
  const explicit = (process.env.APP_MODE ?? "").toLowerCase();
  if (explicit === "live" || explicit === "test" || explicit === "demo") return explicit;
  return forceMock || !stripeSecretKey ? "demo" : "test";
}

export const env = {
  mode: resolveMode(),
  appUrl: (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",
  /** Who receives operator alerts (new reports, IP notices). Grants no access. */
  alertEmails: (process.env.ALERT_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  cronSecret: process.env.CRON_SECRET ?? "",
  authSecret: process.env.AUTH_SECRET ?? "",

  stripeSecretKey,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",
  stripeSubscriptionPriceId: process.env.STRIPE_SUBSCRIPTION_PRICE_ID ?? "",

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    publicBucket: process.env.S3_PUBLIC_BUCKET ?? "",
    privateBucket: process.env.S3_PRIVATE_BUCKET ?? "",
    publicUrl: (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, ""),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? `${BRAND.name} <hello@${BRAND.domain}>`,
};

export const mock = {
  all: forceMock,
  stripe: forceMock || !env.stripeSecretKey,
  storage: forceMock || !env.s3.publicBucket || !env.s3.accessKeyId,
  imageModel: forceMock || !env.openaiApiKey,
  copywriter: forceMock || !env.anthropicApiKey,
  email: forceMock || !env.resendApiKey,
  /** Partner calls are mocked per connection; this forces every connection into mock. */
  fulfillment: forceMock || process.env.FULFILLMENT_MOCK === "true",
};

export const isLive = () => env.mode === "live";

/** Stripe key families: sk_/rk_ + test_/live_. */
export function stripeKeyMode(key = env.stripeSecretKey): "test" | "live" | "none" | "unknown" {
  if (!key) return "none";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return "unknown";
}

export function mockSummary(): Array<{ service: string; live: boolean }> {
  return [
    { service: "Stripe payments & payouts", live: !mock.stripe },
    { service: "File storage (S3)", live: !mock.storage },
    { service: "Image model", live: !mock.imageModel },
    { service: "Copywriter (Claude)", live: !mock.copywriter },
    { service: "Email", live: !mock.email },
    { service: "Fulfillment partners (unless a connection is demo)", live: !mock.fulfillment },
  ];
}
