import { TEST_DATABASE_URL } from "./env";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.AUTH_SECRET = "test-auth-secret";
process.env.APP_URL = "http://localhost:3000";
process.env.PRINTIFY_WEBHOOK_SECRET = "printify-test-secret";
process.env.PRINTFUL_WEBHOOK_SECRET = "printful-test-secret";
process.env.GELATO_WEBHOOK_SECRET = "gelato-test-secret";
process.env.ADMIN_EMAILS = "admin@test.local";
// External services stay mocked unless a test opts in. Set to "" rather than
// deleted: Prisma loads .env on its own and would otherwise fill them back in
// with real credentials.
for (const k of [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "S3_PUBLIC_BUCKET",
  "S3_PRIVATE_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "CRON_SECRET",
  "APP_MODE",
  "MOCK_MODE",
]) {
  process.env[k] = "";
}
