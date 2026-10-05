import { BRAND } from "@/config/brand";

/**
 * Environment access and mock-mode switches.
 *
 * Every external service has a mock so the whole marketplace runs with zero keys.
 * A service goes live as soon as its key is set, unless MOCK_MODE=true forces mocks.
 */

const forceMock = process.env.MOCK_MODE === "true";

export const env = {
  appUrl: (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  cronSecret: process.env.CRON_SECRET ?? "",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
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

export function mockSummary(): Array<{ service: string; live: boolean }> {
  return [
    { service: "Stripe payments & payouts", live: !mock.stripe },
    { service: "File storage (S3)", live: !mock.storage },
    { service: "Image model", live: !mock.imageModel },
    { service: "Copywriter (Claude)", live: !mock.copywriter },
    { service: "Email", live: !mock.email },
    { service: "Fulfillment partners", live: !mock.fulfillment },
  ];
}
