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
// External services stay mocked unless a test opts in.
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.S3_PUBLIC_BUCKET;
