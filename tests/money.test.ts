/**
 * SYN-004, SYN-005, SYN-006, SYN-011, PAY-01, BUY-02, OPS-02: money and partner
 * effects under crashes, retries, races and provider refusals.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = await import("@/lib/db");
const { setPaymentGateway } = await import("@/lib/payments");
const { refundImpact } = await import("@/lib/fees");
const { connectPartner } = await import("@/server/sellers");
const { startCheckout } = await import("@/server/checkout");
const { markOrderPaid, cancelPendingOrder, reconcileOrderFee } = await import("@/server/orders");
const { releaseDuePayouts, payOutSellerOrder } = await import("@/server/payouts");
const { confirmDelivery } = await import("@/server/fulfillment");
const { applyRefund, syncExternalRefund } = await import("@/server/refunds");
const { runJobs } = await import("@/server/jobs");
const { recoverOperations, resolveByHand } = await import("@/server/resolution");
const { runReconciliation } = await import("@/server/reconcile");
const { onDisputeCreated } = await import("@/server/refunds");
const { getProvider } = await import("@/fulfillment/registry");
const { resetDb, makeSeller } = await import("./support/db");
const { approvedListing } = await import("./support/listings");
const { paidOrder, sellerBalance, SHIP } = await import("./support/orders");
const { RecordingGateway } = await import("./support/gateway");

let gw: InstanceType<typeof RecordingGateway>;
beforeEach(async () => {
  await resetDb();
  gw = new RecordingGateway();
  setPaymentGateway(gw);
});

async function deliveredSelfShip(price = 1400, qty = 1) {
  const s = await makeSeller(`s${Math.random().toString(36).slice(2, 7)}`, { selfShip: true });
  const listingId = await approvedListing(s.id, "self", price, "patch");
  const orderId = await paidOrder([{ listingId, quantity: qty }]);
  const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
  await confirmDelivery(orderId, so.id);
  return { seller: s, listingId, orderId, so: await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } }) };
}

describe("paid orders survive crashes (SYN-004)", () => {
  it("records follow-up work in the same transaction and finishes it after a crash", async () => {
    const s = await makeSeller("alpha");
    await connectPartner({ sellerId: s.id, providerId: "printful", credentials: null, demo: true });
    const tee = await approvedListing(s.id, "printful", 3000);
    const { orderId } = await startCheckout({ items: [{ listingId: tee, quantity: 1 }], shipTo: SHIP, email: "b@test.local", buyerId: null });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });

    // Simulate the process dying right after the payment commit, before any job
    // ran: the job runner's first database call fails, so no job is claimed.
    const claim = vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("process killed"));
    await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, feeCents: 100, amountCents: order.totalCents, currency: "usd" });
    claim.mockRestore();

    // Paid and the work is recorded, but nothing was sent yet.
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
    expect(await db.job.count({ where: { status: "PENDING", type: "fulfillment.dispatch" } })).toBe(1);
    expect((await db.fulfillment.findFirstOrThrow({ where: { sellerOrder: { orderId } } })).partnerOrderId).toBeNull();

    // Stripe retries the webhook; and the cron runs too. Exactly one partner order results.
    expect((await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, amountCents: order.totalCents, currency: "usd" })).alreadyPaid).toBe(true);
    await runJobs();
    const f = await db.fulfillment.findFirstOrThrow({ where: { sellerOrder: { orderId } } });
    expect(f.status).toBe("SUBMITTED");
    expect(await db.operation.count({ where: { kind: "partner_order", status: "CONFIRMED" } })).toBe(1);
  });

  it("recovers a partner order that was accepted but whose reply was lost, without a duplicate", async () => {
    const s = await makeSeller("alpha");
    await connectPartner({ sellerId: s.id, providerId: "printful", credentials: null, demo: true });
    const tee = await approvedListing(s.id, "printful", 3000);
    const { orderId } = await startCheckout({ items: [{ listingId: tee, quantity: 1 }], shipTo: SHIP, email: "b@test.local", buyerId: null });
    const f = await db.fulfillment.findFirstOrThrow({ where: { sellerOrder: { orderId } } });

    const adapter = getProvider("printful");
    const real = adapter.createOrder.bind(adapter);
    const spy = vi.spyOn(adapter, "createOrder").mockImplementationOnce(async (ctx, input) => {
      await real(ctx, input); // the partner gets it…
      throw Object.assign(new TypeError("fetch failed"), {}); // …and the response is lost
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, feeCents: 100, amountCents: order.totalCents, currency: "usd" });
    spy.mockRestore();
    const op = await db.operation.findFirstOrThrow({ where: { kind: "partner_order" } });
    expect(op.status).toBe("UNKNOWN");
    expect((await db.fulfillment.findUniqueOrThrow({ where: { id: f.id } })).partnerOrderId).toBeNull();

    await recoverOperations();
    const after = await db.fulfillment.findUniqueOrThrow({ where: { id: f.id } });
    expect(after.partnerOrderId).toMatch(/^mock_printful_/);
    expect(after.status).toBe("SUBMITTED");
    expect(await db.operation.count({ where: { kind: "partner_order", status: "CONFIRMED" } })).toBe(1);
  });
});

describe("verified payments only (PAY-01)", () => {
  it("holds a digital checkout paid from outside the US for review", async () => {
    const seller = await makeSeller("country-check", { digital: true });
    const listingId = await approvedListing(seller.id, "digital", 900, "digital_art");
    const { orderId } = await startCheckout({ items: [{ listingId, quantity: 1 }], shipTo: null, email: "b@test.local", buyerId: null });
    const result = await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, amountCents: 900, taxCents: 0, billingCountry: "CA", currency: "usd" });
    expect(result.mismatch).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING_PAYMENT");
    expect(await db.entitlement.count()).toBe(0);
  });
  it("a payment that does not match the order releases nothing and goes to a person", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const { orderId } = await startCheckout({ items: [{ listingId: id, quantity: 1 }], shipTo: null, email: "b@test.local", buyerId: null });
    const res = await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, amountCents: 1, currency: "usd" });
    expect(res.mismatch).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING_PAYMENT");
    expect(await db.entitlement.count()).toBe(0);
    const op = await db.operation.findFirstOrThrow({ where: { kind: "payment_check" } });
    expect(op.status).toBe("UNKNOWN");

    const admin = await db.user.create({ data: { email: "admin2@test.local", role: "ADMIN", emailVerified: new Date() } });
    await resolveByHand({ opId: op.id, actorId: admin.id, outcome: "CONFIRMED", providerRef: `pi_${orderId}`, note: "Checked Stripe: full amount captured" });
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).not.toBe("PENDING_PAYMENT");
    expect(await db.entitlement.count()).toBe(1);
  });
});

describe("checkout (BUY-02, stock)", () => {
  it("a double submit with the same checkout key reuses one order", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const input = { items: [{ listingId: id, quantity: 1 }], shipTo: null, email: "b@test.local", buyerId: null, checkoutKey: "k-12345678" };
    const [a, b] = await Promise.allSettled([startCheckout(input), startCheckout(input)]);
    const ids = [a, b].filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ orderId: string }>).value.orderId);
    expect(new Set(ids).size).toBe(1);
    expect(await db.order.count()).toBe(1);
    // Same key, different cart: a new attempt.
    const id2 = await approvedListing(s.id, "digital", 1200, "digital_art");
    const c = await startCheckout({ ...input, items: [{ listingId: id2, quantity: 1 }] });
    expect(c.orderId).not.toBe(ids[0]);
  });

  it("two buyers cannot both take the last item; an abandoned checkout gives it back", async () => {
    const s = await makeSeller("alpha", { selfShip: true });
    const id = await approvedListing(s.id, "self", 1400, "patch", { inventory: 1 });
    const tries = await Promise.allSettled([
      startCheckout({ items: [{ listingId: id, quantity: 1 }], shipTo: SHIP, email: "one@test.local", buyerId: null }),
      startCheckout({ items: [{ listingId: id, quantity: 1 }], shipTo: SHIP, email: "two@test.local", buyerId: null }),
    ]);
    const ok = tries.filter((t) => t.status === "fulfilled") as Array<PromiseFulfilledResult<{ orderId: string }>>;
    expect(ok).toHaveLength(1);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).inventory).toBe(0);
    await cancelPendingOrder(ok[0].value.orderId);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).inventory).toBe(1);
  });

  it("refuses delivery outside the approved territory", async () => {
    const s = await makeSeller("alpha", { selfShip: true });
    const id = await approvedListing(s.id, "self", 1400, "patch");
    await expect(startCheckout({ items: [{ listingId: id, quantity: 1 }], shipTo: { ...SHIP, country: "DE" }, email: "b@test.local", buyerId: null })).rejects.toThrow(/delivers to US only/);
  });

  it("the partner gets what was bought, even if the listing changes before payment (SYN-011)", async () => {
    const s = await makeSeller("alpha");
    await connectPartner({ sellerId: s.id, providerId: "printful", credentials: null, demo: true });
    const tee = await approvedListing(s.id, "printful", 3000);
    const { orderId } = await startCheckout({ items: [{ listingId: tee, quantity: 1 }], shipTo: SHIP, email: "b@test.local", buyerId: null });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    // The seller changes the product data and variant after the buyer checked out.
    await db.listing.update({ where: { id: tee }, data: { partnerData: { placement: "back" }, partnerProductId: "999" } });
    await db.listingVariant.updateMany({ where: { listingId: tee }, data: { partnerVariantId: "9999" } });
    const spy = vi.spyOn(getProvider("printful"), "createOrder");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, feeCents: 100, amountCents: order.totalCents, currency: "usd" });
    const sent = spy.mock.calls[0][1].items[0];
    spy.mockRestore();
    expect(sent.partnerProductId).toBe(item.partnerProductId);
    expect(sent.partnerVariantId).toBe(item.partnerVariantId);
    expect(sent.partnerVariantId).not.toBe("9999");
    expect(sent.designUrl).toContain("/api/download/file?"); // a signed link to the private original
  });
});

describe("payouts (SYN-005)", () => {
  it("a transfer whose reply was lost is found at Stripe and recorded once", async () => {
    const { so } = await deliveredSelfShip();
    gw.nextTransferFault = "lose-response";
    const first = await releaseDuePayouts();
    expect(first.paid).toBe(0);
    expect(first.pending).toBe(1);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } })).payoutStatus).toBe("PROCESSING");

    const second = await releaseDuePayouts();
    expect(second.paid).toBe(1);
    expect(gw.transfers).toHaveLength(1);
    expect(await db.payout.count({ where: { sellerOrderId: so.id, status: "PAID" } })).toBe(1);
    expect(await sellerBalance(so.id)).toBe(0);
    expect((await releaseDuePayouts()).paid).toBe(0);
  });

  it("a refused transfer is retried later with a new attempt, never marked paid early", async () => {
    const { so } = await deliveredSelfShip();
    gw.nextTransferFault = "refuse";
    expect((await releaseDuePayouts()).failed).toBe(1);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } })).payoutStatus).toBe("ELIGIBLE");
    expect(gw.transfers).toHaveLength(0);
    expect((await releaseDuePayouts()).paid).toBe(1);
    expect(gw.transfers).toHaveLength(1);
  });

  it("re-checks disputes and halts at the moment of paying", async () => {
    const { so, orderId } = await deliveredSelfShip();
    // Became eligible, then a dispute opened before the run.
    await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "ELIGIBLE" } });
    await db.dispute.create({ data: { orderId, stripeDisputeId: "dp_x", amountCents: 100 } });
    expect((await payOutSellerOrder(so.id)).status).toBe("blocked");
    await db.dispute.deleteMany();
    await db.seller.update({ where: { id: so.sellerId }, data: { payoutsHaltedAt: new Date(), payoutsHaltedReason: "test" } });
    await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "ELIGIBLE" } });
    expect((await payOutSellerOrder(so.id)).status).toBe("blocked");
    expect(gw.transfers).toHaveLength(0);
  });
});

describe("refunds and seller debt (SYN-005, SYN-006)", () => {
  it("keeps Stripe Tax out of seller earnings and refunds tax alongside each seller's sale", async () => {
    const a = await makeSeller("tax-a", { digital: true });
    const b = await makeSeller("tax-b", { digital: true });
    const one = await approvedListing(a.id, "digital", 900, "digital_art");
    const two = await approvedListing(b.id, "digital", 1100, "digital_art");
    const { orderId } = await startCheckout({ items: [{ listingId: one, quantity: 1 }, { listingId: two, quantity: 1 }], shipTo: null, email: "buyer@test.local", buyerId: null });
    await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, feeCents: 100, amountCents: 2101, taxCents: 101, currency: "usd" });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { sellerOrders: true } });
    expect(order.taxCents).toBe(101);
    expect(order.sellerOrders.reduce((sum, so) => sum + so.taxCents, 0)).toBe(101);
    expect((await db.ledgerEntry.aggregate({ where: { orderId, account: "TAX" }, _sum: { amountCents: true } }))._sum.amountCents).toBe(101);
    expect((await runReconciliation()).status).toBe("OK");

    const first = order.sellerOrders.find((so) => so.sellerId === a.id)!;
    await applyRefund({ sellerOrderId: first.id, amountCents: 300, reason: "case reviewed", source: "admin" });
    await applyRefund({ sellerOrderId: first.id, reason: "case reviewed", source: "admin" });
    expect(gw.refunds.reduce((sum, r) => sum + r.amountCents, 0)).toBe(900 + first.taxCents);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: first.id } })).taxRefundedCents).toBe(first.taxCents);
    expect((await runReconciliation()).status).toBe("OK");

    const second = order.sellerOrders.find((so) => so.sellerId === b.id)!;
    await syncExternalRefund(`pi_${orderId}`, 2101);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: second.id } })).taxRefundedCents).toBe(second.taxCents);
    const after = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.refundedCents + after.taxRefundedCents).toBe(2101);
    expect((await runReconciliation()).status).toBe("OK");
  });
  it("two simultaneous full refunds cannot refund twice", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const orderId = await paidOrder([{ listingId: id, quantity: 1 }], { shipTo: null });
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    const results = await Promise.allSettled([
      applyRefund({ sellerOrderId: so.id, reason: "a", source: "admin" }),
      applyRefund({ sellerOrderId: so.id, reason: "b", source: "admin" }),
    ]);
    const refunded = results.filter((r) => r.status === "fulfilled").reduce((a, r) => a + (r as PromiseFulfilledResult<{ refundedCents: number }>).value.refundedCents, 0);
    expect(refunded).toBe(900);
    expect(gw.refunds.reduce((a, r) => a + r.amountCents, 0)).toBe(900);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } })).refundedCents).toBe(900);
  });

  it("a refund whose reply was lost is confirmed by lookup and recorded once", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const orderId = await paidOrder([{ listingId: id, quantity: 1 }], { shipTo: null });
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    gw.nextRefundFault = "lose-response";
    const res = await applyRefund({ sellerOrderId: so.id, amountCents: 400, reason: "partial", source: "admin" });
    expect(res.pending).toBe(true);
    // Reserved, so nobody can refund that money again meanwhile; not yet in the ledger.
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } })).refundedCents).toBe(400);
    expect(await db.ledgerEntry.count({ where: { type: "REFUND" } })).toBe(0);
    await expect(applyRefund({ sellerOrderId: so.id, amountCents: 100, reason: "x", source: "admin" })).rejects.toThrow(/still being confirmed/);

    await recoverOperations();
    expect(gw.refunds).toHaveLength(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).refundedCents).toBe(400);
    expect(await db.ledgerEntry.count({ where: { type: "REFUND", account: "CASH" } })).toBe(1);
  });

  it("when a seller's balance cannot cover a refund, the debt is recorded and taken from their next payout", async () => {
    const first = await deliveredSelfShip(1400);
    await releaseDuePayouts();
    gw.nextReversalFault = "refuse";
    await applyRefund({ sellerOrderId: first.so.id, reason: "Arrived broken", source: "admin" });
    const debt = await db.sellerReceivable.findFirstOrThrow({ where: { sellerId: first.seller.id } });
    expect(debt.status).toBe("OPEN");
    const note = await db.notification.findFirstOrThrow({ where: { type: "refund" }, orderBy: { createdAt: "desc" } });
    expect(note.body).toMatch(/deducted from your next payouts/);
    expect(await sellerBalance(first.so.id)).toBe(-debt.amountCents);

    // Next sale from the same seller.
    const orderId = await paidOrder([{ listingId: first.listingId, quantity: 2 }]);
    const so2 = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    await confirmDelivery(orderId, so2.id);
    await releaseDuePayouts();
    const payout = await db.payout.findFirstOrThrow({ where: { sellerOrderId: so2.id, status: "PAID" } });
    expect(payout.offsetCents).toBe(debt.amountCents);
    expect(payout.amountCents).toBe(so2.netCents - debt.amountCents);
    expect((await db.sellerReceivable.findUniqueOrThrow({ where: { id: debt.id } })).status).toBe("RECOVERED");
    expect(await sellerBalance(first.so.id)).toBe(0);
    expect(await sellerBalance(so2.id)).toBe(0);
    const run = await runReconciliation();
    expect(run.status).toBe("OK");
  });

  it("partial refunds never return more commission than was charged", () => {
    const share = { grossCents: 1001, commissionCents: 80, refundedCents: 0, commissionReturnedCents: 0 };
    let returned = 0;
    let refunded = 0;
    for (const amt of [333, 333, 335]) {
      const i = refundImpact({ ...share, refundedCents: refunded, commissionReturnedCents: returned }, amt);
      returned += i.commissionReturnedCents;
      refunded += i.refundCents;
    }
    expect(refunded).toBe(1001);
    expect(returned).toBe(80);
  });

  it("an estimated card fee is replaced by Stripe's actual fee exactly once", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 2000, "digital_art");
    const orderId = await paidOrder([{ listingId: id, quantity: 1 }], { shipTo: null, feeCents: null });
    const before = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { sellerOrders: true } });
    expect(before.processingFeeStatus).toBe("ESTIMATED");
    await expect(reconcileOrderFee(orderId)).rejects.toThrow(/not reported/);
    gw.fees.set(`pi_${orderId}`, before.processingFeeCents! + 7);
    expect(await reconcileOrderFee(orderId)).toBe("adjusted");
    expect(await reconcileOrderFee(orderId)).toBe("not-needed");
    const after = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { sellerOrders: true } });
    expect(after.processingFeeCents).toBe(before.processingFeeCents! + 7);
    expect(after.sellerOrders[0].netCents).toBe(before.sellerOrders[0].netCents - 7);
    expect(await sellerBalance(after.sellerOrders[0].id)).toBe(after.sellerOrders[0].netCents);
  });
});

describe("reconciliation (OPS-02)", () => {
  it("finds a ledger difference and halts that seller's payouts", async () => {
    const { so } = await deliveredSelfShip();
    expect((await runReconciliation()).status).toBe("OK");
    await db.ledgerEntry.create({ data: { type: "ADJUSTMENT", account: "SELLER", amountCents: 500, sellerId: so.sellerId, orderId: so.orderId, sellerOrderId: so.id, memo: "stray" } });
    const run = await runReconciliation();
    expect(run.status).toBe("DIFFERENCES");
    expect(run.haltedSellerIds).toContain(so.sellerId);
    expect((await releaseDuePayouts()).paid).toBe(0);
    expect(gw.transfers).toHaveLength(0);
  });

  it("flags money operations left unresolved", async () => {
    await db.operation.create({ data: { key: "transfer:x", kind: "transfer", status: "UNKNOWN", payloadHash: "h", payload: {}, updatedAt: new Date(Date.now() - 5 * 3_600_000) } });
    const run = await runReconciliation();
    expect((run.differences as Array<{ kind: string }>).some((d) => d.kind === "unresolved_operation")).toBe(true);
  });
});

describe("disputes still block payouts", () => {
  it("opening a dispute blocks a held payout", async () => {
    const { so, orderId } = await deliveredSelfShip();
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await onDisputeCreated({ paymentIntentId: order.stripePaymentIntentId!, disputeId: "dp_1", amountCents: 100, reason: "fraudulent" });
    expect((await releaseDuePayouts()).paid).toBe(0);
    expect((await db.sellerOrder.findUniqueOrThrow({ where: { id: so.id } })).payoutStatus).toBe("BLOCKED");
  });
});
