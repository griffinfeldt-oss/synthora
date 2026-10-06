/**
 * Webhook handling and the money flow behind it, against a real (test) Postgres.
 * Stripe events are signed with a test secret and sent through the actual route.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const { db } = await import("@/lib/db");
const { setPaymentGateway } = await import("@/lib/payments");
const { MockGateway } = await import("@/lib/payments/mock");
const { connectPartner } = await import("@/server/sellers");
const { startCheckout } = await import("@/server/checkout");
const { releaseDuePayouts } = await import("@/server/payouts");
const { confirmDelivery } = await import("@/server/fulfillment");
const { applyRefund } = await import("@/server/refunds");
const { getProvider, contextFor } = await import("@/fulfillment/registry");
const { connectionWebhookUrl } = await import("@/fulfillment/webhook-url");
const stripeRoute = await import("@/app/api/webhooks/stripe/route");
const partnerRoute = await import("@/app/api/webhooks/fulfillment/[provider]/route");
const { resetDb, makeSeller } = await import("./support/db");
const { approvedListing } = await import("./support/listings");

const stripe = new Stripe("sk_test_dummy");
const SHIP = { name: "Ada Lovelace", line1: "1 Analytical Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" };

function signedStripeRequest(event: object, secret = "whsec_test_secret") {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}

let evtSeq = 0;
function event(type: string, object: Record<string, unknown>) {
  return { id: `evt_test_${++evtSeq}_${Date.now()}`, object: "event", type, data: { object }, created: Math.floor(Date.now() / 1000), livemode: false, api_version: "2026-09-30.endive", pending_webhooks: 1, request: null };
}

async function listing(sellerId: string, provider: "printify" | "printful" | "digital" | "self", priceCents: number, productTypeId = "tshirt") {
  const id = await approvedListing(sellerId, provider, priceCents, productTypeId);
  expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  return id;
}

async function paidOrderViaWebhook(items: Array<{ listingId: string; quantity: number }>, shipTo: typeof SHIP | null = SHIP) {
  const { orderId } = await startCheckout({ items, shipTo, email: "buyer@test.local", buyerId: null });
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const res = await stripeRoute.POST(
    signedStripeRequest(event("checkout.session.completed", { id: `cs_${orderId}`, object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: `pi_${orderId}`, amount_total: order.totalCents, currency: "usd", metadata: { kind: "order", orderId } })),
  );
  expect(res.status).toBe(200);
  return orderId;
}

beforeAll(() => setPaymentGateway(new MockGateway()));
beforeEach(async () => {
  await resetDb();
});

describe("Stripe webhook route", () => {
  it("rejects a bad signature", async () => {
    const res = await stripeRoute.POST(signedStripeRequest(event("checkout.session.completed", {}), "whsec_wrong"));
    expect(res.status).toBe(400);
  });

  it("checkout.session.completed pays a multi-seller order, splits it, and sends partner orders", async () => {
    const a = await makeSeller("alpha");
    const b = await makeSeller("beta", { digital: true });
    await connectPartner({ sellerId: a.id, providerId: "printify", credentials: null, demo: true });
    const tee = await listing(a.id, "printify", 2900);
    const file = await listing(b.id, "digital", 900, "digital_art");

    const orderId = await paidOrderViaWebhook([{ listingId: tee, quantity: 2 }, { listingId: file, quantity: 1 }]);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { sellerOrders: { include: { fulfillments: true } } } });
    expect(order.status).not.toBe("PENDING_PAYMENT");
    expect(order.paidAt).not.toBeNull();

    // Ledger balances: every seller order's SELLER rows equal its net.
    for (const so of order.sellerOrders) {
      const sum = await db.ledgerEntry.aggregate({ where: { sellerOrderId: so.id, account: "SELLER" }, _sum: { amountCents: true } });
      expect(sum._sum.amountCents).toBe(so.netCents);
      expect(so.commissionCents).toBe(Math.round(so.itemsCents * 0.08));
    }
    // Cash in = total; platform kept commission only.
    const cash = await db.ledgerEntry.aggregate({ where: { orderId, type: "CHARGE" }, _sum: { amountCents: true } });
    expect(cash._sum.amountCents).toBe(order.totalCents);
    const commission = await db.ledgerEntry.aggregate({ where: { orderId, account: "PLATFORM" }, _sum: { amountCents: true } });
    expect(commission._sum.amountCents).toBe(Math.round(5800 * 0.08) + Math.round(900 * 0.08));
    // Net + commission + Stripe fee = total charged.
    const net = order.sellerOrders.reduce((s, x) => s + x.netCents, 0);
    expect(net + commission._sum.amountCents! + order.processingFeeCents!).toBe(order.totalCents);

    const teeSo = order.sellerOrders.find((s) => s.sellerId === a.id)!;
    expect(teeSo.fulfillments[0].partnerOrderId).toMatch(/^mock_printify_/);
    expect(teeSo.fulfillments[0].status).toBe("SUBMITTED");
    const fileSo = order.sellerOrders.find((s) => s.sellerId === b.id)!;
    expect(fileSo.fulfillments[0].status).toBe("DELIVERED");
    expect(fileSo.payoutStatus).toBe("HELD");
    expect(fileSo.payoutEligibleAt).not.toBeNull();
  });

  it("is idempotent: the same event twice changes nothing the second time", async () => {
    const a = await makeSeller("alpha");
    await connectPartner({ sellerId: a.id, providerId: "printful", credentials: null, demo: true });
    const tee = await listing(a.id, "printful", 3100);
    const { orderId } = await startCheckout({ items: [{ listingId: tee, quantity: 1 }], shipTo: SHIP, email: "b@test.local", buyerId: null });
    const evt = event("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: `pi_${orderId}`, metadata: { kind: "order", orderId } });
    await stripeRoute.POST(signedStripeRequest(evt));
    const rows = await db.ledgerEntry.count({ where: { orderId } });
    const second = await stripeRoute.POST(signedStripeRequest(evt));
    expect((await second.json()).result).toBe("duplicate");
    expect(await db.ledgerEntry.count({ where: { orderId } })).toBe(rows);
    expect(await db.fulfillment.count({ where: { sellerOrder: { orderId }, partnerOrderId: { not: null } } })).toBe(1);
  });

  it("partner failure flags the order for the seller and notifies the buyer", async () => {
    const a = await makeSeller("alpha");
    await connectPartner({ sellerId: a.id, providerId: "printify", credentials: null, demo: true });
    const tee = await listing(a.id, "printify", 2900);
    const orderId = await paidOrderViaWebhook([{ listingId: tee, quantity: 1 }], { ...SHIP, line1: "1 Fail Street" });
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId }, include: { fulfillments: true } });
    expect(so.status).toBe("ACTION_NEEDED");
    expect(so.fulfillments[0].status).toBe("FAILED");
    expect(await db.notification.count({ where: { type: "fulfillment_failed" } })).toBe(1);
    expect(await db.emailOutbox.count({ where: { to: "buyer@test.local", subject: { contains: "delay" } } })).toBe(1);
  });

  it("failed subscription pauses listings (not deletes); paying restores them", async () => {
    const a = await makeSeller("alpha");
    await connectPartner({ sellerId: a.id, providerId: "printify", credentials: null, demo: true });
    const id = await listing(a.id, "printify", 2900);
    await stripeRoute.POST(signedStripeRequest(event("invoice.payment_failed", { id: "in_1", object: "invoice", customer: "cus_test_alpha", parent: null, amount_paid: 0 })));
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("PAUSED_BILLING");
    expect((await db.seller.findUniqueOrThrow({ where: { id: a.id } })).subscriptionStatus).toBe("PAST_DUE");
    await stripeRoute.POST(signedStripeRequest(event("invoice.paid", { id: "in_2", object: "invoice", customer: "cus_test_alpha", parent: null, amount_paid: 300 })));
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    const plan = await db.ledgerEntry.aggregate({ where: { type: "SUBSCRIPTION", account: "PLATFORM" }, _sum: { amountCents: true } });
    expect(plan._sum.amountCents).toBe(300);
  });

  it("disputes block payouts; a won dispute releases them", async () => {
    const a = await makeSeller("alpha");
    await connectPartner({ sellerId: a.id, providerId: "printify", credentials: null, demo: true });
    const tee = await listing(a.id, "printify", 2900);
    const orderId = await paidOrderViaWebhook([{ listingId: tee, quantity: 1 }]);
    const pi = (await db.order.findUniqueOrThrow({ where: { id: orderId } })).stripePaymentIntentId!;
    await stripeRoute.POST(signedStripeRequest(event("charge.dispute.created", { id: "dp_1", object: "dispute", payment_intent: pi, amount: 3375, reason: "fraudulent", status: "needs_response" })));
    expect((await db.sellerOrder.findFirstOrThrow({ where: { orderId } })).payoutStatus).toBe("BLOCKED");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DISPUTED");
    await stripeRoute.POST(signedStripeRequest(event("charge.dispute.closed", { id: "dp_1", object: "dispute", payment_intent: pi, amount: 3375, status: "won" })));
    expect((await db.sellerOrder.findFirstOrThrow({ where: { orderId } })).payoutStatus).toBe("HELD");
  });

  it("charge.refunded from the Stripe dashboard is reflected in the seller's net", async () => {
    const a = await makeSeller("alpha");
    await connectPartner({ sellerId: a.id, providerId: "printify", credentials: null, demo: true });
    const tee = await listing(a.id, "printify", 2900);
    const orderId = await paidOrderViaWebhook([{ listingId: tee, quantity: 1 }]);
    const before = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    const pi = (await db.order.findUniqueOrThrow({ where: { id: orderId } })).stripePaymentIntentId!;
    await stripeRoute.POST(signedStripeRequest(event("charge.refunded", { id: "ch_1", object: "charge", payment_intent: pi, amount_refunded: 1000 })));
    const after = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    expect(after.refundedCents).toBe(1000);
    expect(after.netCents).toBe(before.netCents - (1000 - Math.round((before.commissionCents * 1000) / (before.itemsCents + before.shippingCents))));
  });
});

describe("Partner webhook route", () => {
  it("applies a signed Printify shipment + delivery and starts the payout hold", async () => {
    const a = await makeSeller("alpha");
    await connectPartner({ sellerId: a.id, providerId: "printify", credentials: null, demo: true });
    const tee = await listing(a.id, "printify", 2900);
    const orderId = await paidOrderViaWebhook([{ listingId: tee, quantity: 1 }]);
    const f = await db.fulfillment.findFirstOrThrow({ where: { sellerOrder: { orderId } } });
    const printify = getProvider("printify");

    for (const status of ["SHIPPED", "DELIVERED"] as const) {
      const req = printify.buildMockWebhook!(f.partnerOrderId!, status);
      const res = await partnerRoute.POST(new Request("http://localhost/api/webhooks/fulfillment/printify", { method: "POST", body: req.rawBody, headers: req.headers }), { params: Promise.resolve({ provider: "printify" }) });
      expect(res.status).toBe(200);
    }
    const after = await db.fulfillment.findUniqueOrThrow({ where: { id: f.id }, include: { sellerOrder: true } });
    expect(after.status).toBe("DELIVERED");
    expect(after.trackingNumber).toBeTruthy();
    expect(after.sellerOrder.status).toBe("DELIVERED");
    expect(after.sellerOrder.payoutEligibleAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
  });

  it("rejects an unsigned partner webhook", async () => {
    const res = await partnerRoute.POST(new Request("http://localhost/api/webhooks/fulfillment/printify", { method: "POST", body: "{}" }), { params: Promise.resolve({ provider: "printify" }) });
    expect(res.status).toBe(401);
  });

  it("per-connection URLs only update that seller's orders", async () => {
    const a = await makeSeller("alpha");
    const b = await makeSeller("beta");
    const ca = await connectPartner({ sellerId: a.id, providerId: "printful", credentials: null, demo: true });
    await connectPartner({ sellerId: b.id, providerId: "printful", credentials: null, demo: true });
    void ca;
    const tb = await listing(b.id, "printful", 3000);
    const orderId = await paidOrderViaWebhook([{ listingId: tb, quantity: 1 }]);
    const fb = await db.fulfillment.findFirstOrThrow({ where: { sellerOrder: { orderId } } });
    const connA = await db.partnerConnection.findFirstOrThrow({ where: { sellerId: a.id } });
    const req = getProvider("printful").buildMockWebhook!(fb.partnerOrderId!, "SHIPPED");
    // Seller A's URL cannot move seller B's order.
    const url = connectionWebhookUrl("printful", connA.id).replace("http://localhost:3000", "http://localhost");
    const res = await partnerRoute.POST(new Request(url, { method: "POST", body: req.rawBody }), { params: Promise.resolve({ provider: "printful" }) });
    expect((await res.json()).applied).toBe(0);
    expect((await db.fulfillment.findUniqueOrThrow({ where: { id: fb.id } })).status).toBe("SUBMITTED");
  });
});

describe("payouts", () => {
  it("transfers net to the seller after the buyer confirms delivery, once", async () => {
    const a = await makeSeller("alpha", { selfShip: true });
    const patch = await listing(a.id, "self", 1400, "patch");
    const orderId = await paidOrderViaWebhook([{ listingId: patch, quantity: 2 }]);
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    expect((await releaseDuePayouts()).paid).toBe(0); // still held

    await confirmDelivery(orderId, so.id);
    const run = await releaseDuePayouts();
    expect(run.paid).toBe(1);
    expect(run.totalCents).toBe(so.netCents);
    expect((await releaseDuePayouts()).paid).toBe(0); // never twice

    const payout = await db.payout.findFirstOrThrow({ where: { sellerOrderId: so.id } });
    expect(payout.amountCents).toBe(so.netCents);
    const owed = await db.ledgerEntry.aggregate({ where: { sellerOrderId: so.id, account: "SELLER" }, _sum: { amountCents: true } });
    expect(owed._sum.amountCents).toBe(0); // fully paid
  });

  it("holds payouts for sellers who cannot receive them", async () => {
    const a = await makeSeller("alpha", { selfShip: true });
    const patch = await listing(a.id, "self", 1400, "patch");
    const orderId = await paidOrderViaWebhook([{ listingId: patch, quantity: 1 }]);
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    await db.seller.update({ where: { id: a.id }, data: { payoutsEnabled: false } });
    await confirmDelivery(orderId, so.id);
    const run = await releaseDuePayouts();
    expect(run.blocked).toBe(1);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } })).payoutStatus).toBe("BLOCKED");
  });

  it("a refund after payout reverses the transfer", async () => {
    const a = await makeSeller("alpha", { selfShip: true });
    const patch = await listing(a.id, "self", 1400, "patch");
    const orderId = await paidOrderViaWebhook([{ listingId: patch, quantity: 1 }]);
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    await confirmDelivery(orderId, so.id);
    await releaseDuePayouts();
    await applyRefund({ sellerOrderId: so.id, reason: "damaged", source: "admin" });
    const after = await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id }, include: { payouts: true } });
    expect(after.status).toBe("REFUNDED");
    expect(after.payoutStatus).toBe("REVERSED");
    expect(after.payouts[0].reversedCents).toBeGreaterThan(0);
    const owed = await db.ledgerEntry.aggregate({ where: { sellerOrderId: so.id, account: "SELLER" }, _sum: { amountCents: true } });
    // Commission comes back; the card fee was passed through at cost, so the seller bears it.
    expect(after.payouts[0].reversedCents).toBe(after.payouts[0].amountCents);
    expect(owed._sum.amountCents).toBe(-after.processingFeeCents);
  });
});
