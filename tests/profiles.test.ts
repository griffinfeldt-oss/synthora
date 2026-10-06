/**
 * SYN-007 (production profiles), SYN-009 (AI budget), SYN-013 (analytics flags).
 * Live mode is set before the app's modules load, as it would be on a server.
 */
import { beforeEach, describe, expect, it } from "vitest";

process.env.APP_MODE = "live";
process.env.STRIPE_SECRET_KEY = "sk_test_not_a_live_key";

const { db } = await import("@/lib/db");
const { env } = await import("@/lib/env");
const { blockingProblems, configChecks } = await import("@/lib/readiness");
const { LAUNCH } = await import("@/config/launch");
const { setPaymentGateway } = await import("@/lib/payments");
const { connectPartner } = await import("@/server/sellers");
const { searchListings } = await import("@/server/listings");
const { payOutSellerOrder } = await import("@/server/payouts");
const { generateDesigns, StudioError } = await import("@/server/studio");
const { reserveUsage, releaseUsage, commitUsage, BudgetError } = await import("@/server/usage");
const { track } = await import("@/server/analytics");
const { resetDb, makeSeller } = await import("./support/db");
const { approvedListing } = await import("./support/listings");
const { RecordingGateway } = await import("./support/gateway");

beforeEach(async () => {
  await resetDb();
  setPaymentGateway(new RecordingGateway());
});

describe("live mode refuses to run half-configured (SYN-007)", () => {
  it("lists every blocking problem: test key, mocks, storage, email, secrets, gates", () => {
    expect(env.mode).toBe("live");
    const ids = blockingProblems().map((c) => c.id);
    for (const id of ["stripe-live-key", "storage", "private-bucket", "email", "cron-secret", "https", "launch-gates"]) expect(ids).toContain(id);
  });

  it("a test deployment with a live Stripe key is blocked too", async () => {
    const saved = { mode: env.mode, key: env.stripeSecretKey };
    env.mode = "test";
    env.stripeSecretKey = "rk_live_abc";
    try {
      expect(configChecks().find((c) => c.id === "stripe-key-not-live")?.ok).toBe(false);
    } finally {
      env.mode = saved.mode;
      env.stripeSecretKey = saved.key;
    }
  });

  it("demo shops and demo partner connections never sell or get paid in live mode", async () => {
    const real = await makeSeller("realshop", { selfShip: true });
    const demo = await makeSeller("demoshop", { selfShip: true });
    await db.seller.update({ where: { id: demo.id }, data: { isTest: true } });
    await approvedListing(real.id, "self", 1400, "patch");
    await approvedListing(demo.id, "self", 1400, "patch");
    const found = await searchListings({});
    expect(found.items.map((l) => l.sellerId)).toEqual([real.id]);

    await expect(connectPartner({ sellerId: real.id, providerId: "printful", credentials: null, demo: true })).rejects.toThrow(/not available on the live marketplace/);

    // Even if a demo shop somehow had a paid order, it is not paid out.
    const so = await db.sellerOrder.create({
      data: { order: { create: { number: "L-1", email: "x@test.local", subtotalCents: 1000, shippingCents: 0, totalCents: 1000, accessToken: "tok-live-1", feePolicyVersion: "t", status: "PAID", paidAt: new Date() } }, seller: { connect: { id: demo.id } }, itemsCents: 1000, shippingCents: 0, commissionCents: 80, processingFeeCents: 59, partnerCostCents: 0, netCents: 861, status: "COMPLETED", payoutStatus: "ELIGIBLE", payoutEligibleAt: new Date() },
    });
    expect((await payOutSellerOrder(so.id)).status).toBe("blocked");
  });

  it("the demo image generator is never offered as a real AI model in live mode", async () => {
    const s = await makeSeller("alpha");
    await expect(generateDesigns({ seller: s, prompt: "a fox", productType: "tshirt" })).rejects.toThrow(StudioError);
  });
});

describe("AI budget (SYN-009)", () => {
  it("reserves atomically: concurrent requests cannot both pass the per-seller limit", async () => {
    const s = await makeSeller("alpha");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveUsage(s.id, "image", 4, 20)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(LAUNCH.ai.concurrentBatchesPerSeller);
  });

  it("enforces the hourly cap, the platform's daily spend cap, and the off switch", async () => {
    const s = await makeSeller("alpha");
    // Failed (released) batches do not use up the allowance…
    for (let i = 0; i < 3; i++) await releaseUsage(await reserveUsage(s.id, "image", 4, 0));
    // …completed ones do.
    for (let i = 0; i < LAUNCH.ai.batchesPerSellerPerHour; i++) await commitUsage(await reserveUsage(s.id, "image", 4, 0), 0);
    await expect(reserveUsage(s.id, "image", 4, 0)).rejects.toThrow(/this hour/);
    const t = await makeSeller("beta");
    await expect(reserveUsage(t.id, "image", 4, LAUNCH.ai.platformDailyBudgetCents + 1)).rejects.toThrow(/budget for today/);
    const saved = LAUNCH.ai.enabled;
    LAUNCH.ai.enabled = false;
    try {
      await expect(reserveUsage(t.id, "copy", 1, 1)).rejects.toThrow(BudgetError);
    } finally {
      LAUNCH.ai.enabled = saved;
    }
  });

  it("shops that are not approved with an active plan cannot generate", async () => {
    const s = await makeSeller("alpha");
    await db.seller.update({ where: { id: s.id }, data: { subscriptionStatus: "PAST_DUE" } });
    await expect(generateDesigns({ seller: { ...s, subscriptionStatus: "PAST_DUE" }, prompt: "a fox", productType: "tshirt" })).rejects.toThrow(/approved and your plan is active/);
  });
});

describe("analytics (SYN-013)", () => {
  it("deduplicates events and flags non-live traffic", async () => {
    await track({ name: "payment_confirmed", orderId: "o1", dedupeKey: "payment_confirmed:o1" });
    await track({ name: "payment_confirmed", orderId: "o1", dedupeKey: "payment_confirmed:o1" });
    expect(await db.analyticsEvent.count()).toBe(1);
    await track({ name: "product_viewed", isTest: true, isInternal: true });
    expect(await db.analyticsEvent.count({ where: { isTest: false, isInternal: false } })).toBe(1);
  });
});
