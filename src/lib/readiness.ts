/**
 * Launch readiness: is this deployment configured for the mode it claims?
 *
 * `configChecks()` is synchronous and runs at server start (src/instrumentation.ts).
 * In live mode any failing "block" check stops the server, so a half-configured
 * deployment cannot take real payments. Test mode only blocks on the Stripe key
 * being a live key. The admin Readiness page shows every check.
 */
import { LAUNCH, missingGates } from "@/config/launch";
import { env, mock, stripeKeyMode } from "./env";

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  /** block: live mode refuses to run. warn: shown to operators only. */
  severity: "block" | "warn";
}

function encryptionKeyOk(): boolean {
  try {
    return Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64").length === 32;
  } catch {
    return false;
  }
}

export function configChecks(): Check[] {
  const live = env.mode === "live";
  const keyMode = stripeKeyMode();
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  if (env.mode === "test" || env.mode === "demo") {
    add({
      id: "stripe-key-not-live",
      label: "Stripe key is not a live key",
      ok: keyMode !== "live",
      detail: "A live Stripe key needs APP_MODE=live and every live check passing.",
      severity: "block",
    });
  }
  if (env.mode === "test") {
    add({ id: "stripe-test-key", label: "Stripe test key set", ok: keyMode === "test", severity: "block" });
    add({ id: "stripe-webhook", label: "Stripe webhook secret set", ok: Boolean(env.stripeWebhookSecret), severity: "warn" });
  }

  if (live) {
    add({ id: "stripe-live-key", label: "Stripe live key", ok: keyMode === "live", detail: "STRIPE_SECRET_KEY must start with sk_live_ or rk_live_.", severity: "block" });
    add({ id: "stripe-webhook", label: "Stripe webhook secret", ok: Boolean(env.stripeWebhookSecret), severity: "block" });
    add({ id: "no-mock-mode", label: "No forced mocks", ok: !mock.all && !mock.fulfillment, detail: "MOCK_MODE and FULFILLMENT_MOCK must be off.", severity: "block" });
    add({ id: "auth-secret", label: "AUTH_SECRET (32+ characters)", ok: env.authSecret.length >= 32, severity: "block" });
    add({ id: "encryption-key", label: "ENCRYPTION_KEY (32 bytes)", ok: encryptionKeyOk(), severity: "block" });
    add({ id: "cron-secret", label: "CRON_SECRET", ok: env.cronSecret.length >= 24, severity: "block" });
    add({ id: "https", label: "Public HTTPS URL", ok: env.appUrl.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(env.appUrl), severity: "block" });
    add({ id: "storage", label: "Object storage configured", ok: !mock.storage, severity: "block" });
    add({
      id: "private-bucket",
      label: "Separate private bucket",
      ok: Boolean(env.s3.privateBucket) && env.s3.privateBucket !== env.s3.publicBucket,
      detail: "Purchased files and design originals need a bucket with no public access.",
      severity: "block",
    });
    add({ id: "email", label: "Email delivery (Resend)", ok: !mock.email, detail: "Verification and receipts must actually arrive.", severity: "block" });
    const gates = missingGates();
    add({
      id: "launch-gates",
      label: "Launch gates signed off",
      ok: gates.length === 0,
      detail: gates.length ? `Missing in src/config/launch.ts: ${gates.join(", ")}` : undefined,
      severity: "block",
    });
    add({
      id: "studio-model",
      label: "AI studio has a real image model",
      ok: !LAUNCH.generationStudio || !mock.imageModel,
      detail: "Without OPENAI_API_KEY the studio is switched off in live mode.",
      severity: "warn",
    });
  }

  add({ id: "auth-secret-set", label: "AUTH_SECRET set", ok: Boolean(env.authSecret) || !env.isProduction, severity: live ? "block" : "warn" });
  return checks;
}

export function blockingProblems(checks = configChecks()): Check[] {
  return checks.filter((c) => !c.ok && c.severity === "block");
}

/** Throws when this deployment must not serve traffic in its configured mode. */
export function assertReadyToServe(): void {
  const problems = blockingProblems();
  if (problems.length === 0) return;
  const list = problems.map((p) => `  - ${p.label}${p.detail ? `: ${p.detail}` : ""}`).join("\n");
  throw new Error(`Synthora is not configured for APP_MODE=${env.mode}. Fix these before it can start:\n${list}`);
}
