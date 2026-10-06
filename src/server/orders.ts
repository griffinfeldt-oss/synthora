/**
 * What happens after a buyer pays. Called by the Stripe webhook
 * (checkout.session.completed) and by the mock checkout page alike.
 *
 * Paying is one transaction: the order becomes PAID, the ledger is written,
 * download entitlements are issued, and every follow-up (notifications, partner
 * orders, fee reconciliation) is recorded as a durable job. The jobs then run
 * immediately and are retried by cron until done, so a crash after the commit
 * can delay that work but never lose it.
 */
import "server-only";
import { FEES } from "@/config/fees";
import { LAUNCH } from "@/config/launch";
import { db } from "@/lib/db";
import { allocateProportionally, estimateProcessingFee, splitOrder } from "@/lib/fees";
import { payments } from "@/lib/payments";
import { writeLedger, type LedgerRow } from "./ledger";
import { enqueue, runJobs, type JobSpec } from "./jobs";
import { audit } from "./notify";
import { payloadHash } from "./operations";
import { track } from "./analytics";

export interface PaidInput {
  orderId: string;
  paymentIntentId: string;
  chargeId?: string | null;
  /** The processor's actual fee, when the caller knows it (mock checkout). Looked up otherwise. */
  feeCents?: number | null;
  /** What the processor says was paid. Must match the order exactly. */
  amountCents?: number | null;
  taxCents?: number | null;
  /** Country collected by Stripe Checkout; present for signed Stripe events. */
  billingCountry?: string | null;
  currency?: string | null;
}

export function orderJobKeys(orderId: string, fulfillmentIds: string[]): string[] {
  return [`order-paid-notify:${orderId}`, `fee-reconcile:${orderId}`, ...fulfillmentIds.map((id) => `dispatch:${id}`)];
}

/** A payment that does not match its order is held for a person, never fulfilled. */
async function holdMismatchedPayment(order: { id: string; number: string; totalCents: number; currency: string }, input: PaidInput) {
  const payload = { orderId: order.id, paymentIntentId: input.paymentIntentId, expectedPreTaxCents: order.totalCents, expectedCurrency: order.currency, paidCents: input.amountCents ?? null, paidTaxCents: input.taxCents ?? null, paidCurrency: input.currency ?? null, billingCountry: input.billingCountry ?? null };
  await db.operation.createMany({
    data: [
      {
        key: `payment-check:${order.id}:${input.paymentIntentId}`,
        kind: "payment_check",
        status: "UNKNOWN",
        payloadHash: payloadHash(payload),
        payload,
        orderId: order.id,
        lastError: `Payment, tax, currency or buyer country could not be verified. Paid ${input.amountCents ?? "?"} ${input.currency ?? "?"}, tax ${input.taxCents ?? "?"}, pre-tax ${order.totalCents} ${order.currency}, country ${input.billingCountry ?? "?"}. Nothing was released.`,
        ownerRole: "finance",
        escalateAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });
  await audit(null, "payment.mismatch", "Order", order.id, payload);
}

/** Idempotent: calling it twice for the same order does nothing the second time. */
export async function markOrderPaid(input: PaidInput): Promise<{ alreadyPaid: boolean; mismatch?: boolean }> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { sellerOrders: { include: { items: true, fulfillments: true } } },
  });
  if (!order) throw new Error(`Order ${input.orderId} not found`);
  const fulfillmentIds = order.sellerOrders.flatMap((so) => so.fulfillments.map((f) => f.id));
  if (order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED") {
    // A retried webhook: make sure the follow-up work has run.
    await runJobs({ keys: orderJobKeys(order.id, fulfillmentIds) });
    return { alreadyPaid: true };
  }

  const taxCents = input.taxCents ?? 0;
  if (input.amountCents !== undefined && input.amountCents !== null) {
    const currency = (input.currency ?? FEES.currency).toLowerCase();
    const outsideTerritory = !order.shippingAddress && input.billingCountry !== undefined && !LAUNCH.territory.buyerCountries.includes((input.billingCountry ?? "").toUpperCase());
    if (!Number.isSafeInteger(taxCents) || taxCents < 0 || input.amountCents !== order.totalCents + taxCents || currency !== order.currency.toLowerCase() || outsideTerritory) {
      await holdMismatchedPayment(order, input);
      return { alreadyPaid: false, mismatch: true };
    }
  }

  let chargeId = input.chargeId ?? null;
  let feeCents = input.feeCents ?? null;
  if (feeCents === null || chargeId === null) {
    try {
      const info = await payments().getChargeInfo(input.paymentIntentId);
      chargeId ??= info.chargeId;
      feeCents ??= info.feeCents;
    } catch {
      // Stripe sometimes has not settled the fee yet; reconciled later.
    }
  }
  const feeStatus = feeCents === null ? "ESTIMATED" : "ACTUAL";
  feeCents ??= estimateProcessingFee(order.totalCents + taxCents);

  const split = splitOrder(
    order.sellerOrders.map((so) => ({
      sellerId: so.sellerId,
      itemsCents: so.itemsCents,
      shippingCents: so.shippingCents,
      partnerCostCents: so.partnerCostCents,
    })),
    { processingFeeCents: feeCents },
  );

  const jobs: JobSpec[] = [
    { key: `order-paid-notify:${order.id}`, type: "order.notify_paid", payload: { orderId: order.id } },
    ...fulfillmentIds.map((id) => ({ key: `dispatch:${id}`, type: "fulfillment.dispatch", payload: { fulfillmentId: id }, ownerRole: "operations", maxAttempts: 10 })),
    ...(feeStatus === "ESTIMATED"
      ? [{ key: `fee-reconcile:${order.id}`, type: "fee.reconcile", payload: { orderId: order.id }, runAt: new Date(Date.now() + 10 * 60_000), ownerRole: "finance", maxAttempts: 12 }]
      : []),
  ];

  const claimed = await db.$transaction(async (tx) => {
    // Claim the order atomically so concurrent webhooks cannot both process it.
    const res = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["PENDING_PAYMENT", "CANCELED"] } },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntentId: input.paymentIntentId,
        stripeChargeId: chargeId,
        processingFeeCents: feeCents,
        processingFeeStatus: feeStatus,
        taxCents,
      },
    });
    if (res.count === 0) return false;

    const rows: LedgerRow[] = [
      { type: "CHARGE", account: "CASH", amountCents: order.totalCents + taxCents, orderId: order.id, stripeRef: input.paymentIntentId, memo: `Order ${order.number}` },
      { type: "SALES_TAX", account: "TAX", amountCents: taxCents, orderId: order.id, memo: "Stripe Tax collected" },
      { type: "PROCESSING_FEE", account: "CASH", amountCents: -feeCents!, orderId: order.id, stripeRef: chargeId, memo: feeStatus === "ACTUAL" ? "Stripe processing fee" : "Stripe processing fee (estimate until Stripe reports it)" },
    ];

    const taxShares = allocateProportionally(taxCents, order.sellerOrders.map((so) => so.itemsCents + so.shippingCents));
    for (const [sellerIndex, so] of order.sellerOrders.entries()) {
      const share = split.sellers.find((s) => s.sellerId === so.sellerId)!;
      await tx.sellerOrder.update({
        where: { id: so.id },
        data: {
          status: "PAID",
          payoutStatus: "HELD",
          processingFeeCents: share.processingFeeCents,
          commissionCents: share.commissionCents,
          netCents: share.netCents,
          taxCents: taxShares[sellerIndex],
        },
      });
      const base = { sellerId: so.sellerId, orderId: order.id, sellerOrderId: so.id };
      rows.push(
        { ...base, type: "SELLER_SALE", account: "SELLER", amountCents: share.grossCents, memo: "Items + shipping" },
        { ...base, type: "COMMISSION", account: "SELLER", amountCents: -share.commissionCents, memo: `${FEES.commission.rateBps / 100}% commission` },
        { ...base, type: "COMMISSION", account: "PLATFORM", amountCents: share.commissionCents, memo: `${FEES.commission.rateBps / 100}% commission` },
        { ...base, type: "PROCESSING_FEE", account: "SELLER", amountCents: -share.processingFeeCents, memo: "Card processing at cost" },
      );

      for (const item of so.items) {
        await tx.listing.update({ where: { id: item.listingId }, data: { salesCount: { increment: item.quantity } } });
        // Stock was reserved at checkout; a late payment on a canceled order takes it now.
        if (item.inventoryReserved === 0 && item.provider === "self") {
          await tx.listing.updateMany({ where: { id: item.listingId, inventory: { not: null } }, data: { inventory: { decrement: item.quantity } } });
        }
        // The right to download exactly the file version that was sold.
        if (item.deliverableAssetId) {
          await tx.entitlement.create({
            data: { orderItemId: item.id, orderId: order.id, assetId: item.deliverableAssetId, licenseVersionId: item.licenseVersionId },
          });
        }
      }
    }
    await writeLedger(tx, rows, `order-paid:${order.id}`);
    await enqueue(tx, jobs);
    return true;
  });
  if (!claimed) return { alreadyPaid: true };

  await track({ name: "payment_confirmed", orderId: order.id, dedupeKey: `payment_confirmed:${order.id}`, isTest: order.mode !== "live", props: { totalCents: order.totalCents + taxCents, taxCents } });
  await runJobs({ keys: jobs.map((j) => j.key) });
  return { alreadyPaid: false };
}

/** Checkout session expired or abandoned: release the pending order and its stock. */
export async function cancelPendingOrder(orderId: string): Promise<void> {
  const items = await db.orderItem.findMany({ where: { orderId, inventoryReserved: { gt: 0 } } });
  await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: orderId, status: "PENDING_PAYMENT" }, data: { status: "CANCELED" } });
    if (res.count === 0) return;
    await tx.sellerOrder.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELED", payoutStatus: "CANCELED" } });
    for (const item of items) {
      await tx.listing.updateMany({ where: { id: item.listingId, inventory: { not: null } }, data: { inventory: { increment: item.inventoryReserved } } });
      await tx.orderItem.update({ where: { id: item.id }, data: { inventoryReserved: 0 } });
    }
  });
}

/** Release orders whose checkout was never completed (sessions expire after an hour). */
export async function expireStaleCheckouts(olderThanMs = 3 * 3_600_000): Promise<number> {
  const stale = await db.order.findMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - olderThanMs) } }, select: { id: true } });
  for (const o of stale) await cancelPendingOrder(o.id);
  return stale.length;
}

/** Recompute the buyer-level order status from its seller orders. */
export async function refreshOrderStatus(orderId: string): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { sellerOrders: true, disputes: true } });
  if (!order || order.status === "PENDING_PAYMENT" || order.status === "CANCELED") return;
  const statuses = order.sellerOrders.map((s) => s.status);
  let status = order.status;
  if (order.disputes.some((d) => d.status === "OPEN")) status = "DISPUTED";
  else if (order.refundedCents >= order.totalCents && order.totalCents > 0) status = "REFUNDED";
  else if (order.refundedCents > 0) status = "PARTIALLY_REFUNDED";
  else if (statuses.every((s) => s === "DELIVERED" || s === "COMPLETED" || s === "CANCELED" || s === "REFUNDED")) status = "COMPLETED";
  else if (statuses.some((s) => s !== "PAID")) status = "FULFILLING";
  else status = "PAID";
  if (status !== order.status) await db.order.update({ where: { id: orderId }, data: { status } });
}

/**
 * Replace an estimated card fee with Stripe's actual fee and move the difference
 * onto the right sellers, exactly once. Throws (so the job retries) while Stripe
 * has not reported the fee.
 */
export async function reconcileOrderFee(orderId: string): Promise<"adjusted" | "unchanged" | "not-needed"> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { sellerOrders: true } });
  if (!order || order.processingFeeStatus !== "ESTIMATED" || !order.stripePaymentIntentId) return "not-needed";
  const info = await payments().getChargeInfo(order.stripePaymentIntentId);
  if (info.feeCents === null) throw new Error("Stripe has not reported the fee yet.");
  const actual = info.feeCents;
  const estimated = order.processingFeeCents ?? 0;
  if (actual === estimated) {
    await db.order.update({ where: { id: order.id }, data: { processingFeeStatus: "ACTUAL" } });
    return "unchanged";
  }
  const parts = allocateProportionally(actual, order.sellerOrders.map((so) => so.itemsCents + so.shippingCents));
  await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: order.id, processingFeeStatus: "ESTIMATED" }, data: { processingFeeCents: actual, processingFeeStatus: "ACTUAL" } });
    if (res.count === 0) return;
    const rows: LedgerRow[] = [{ type: "FEE_ADJUSTMENT", account: "CASH", amountCents: estimated - actual, orderId: order.id, stripeRef: info.chargeId, memo: `Actual Stripe fee ${actual}¢ (estimated ${estimated}¢)` }];
    order.sellerOrders.forEach((so, i) => {
      const delta = parts[i] - so.processingFeeCents; // >0: the seller owes more
      if (delta === 0) return;
      rows.push({ type: "FEE_ADJUSTMENT", account: "SELLER", amountCents: -delta, sellerId: so.sellerId, orderId: order.id, sellerOrderId: so.id, memo: "Card fee: actual instead of estimate" });
    });
    for (const [i, so] of order.sellerOrders.entries()) {
      const delta = parts[i] - so.processingFeeCents;
      if (delta === 0) continue;
      const paidOut = so.payoutStatus === "PAID" || so.payoutStatus === "PROCESSING" || so.payoutStatus === "REVERSED";
      await tx.sellerOrder.update({
        where: { id: so.id },
        data: { processingFeeCents: parts[i], netCents: { decrement: delta } },
      });
      // Already paid at the estimate: the difference is settled on a later payout.
      if (paidOut) {
        await tx.sellerReceivable.create({
          data: { sellerId: so.sellerId, sellerOrderId: so.id, orderId: order.id, amountCents: delta, reason: delta > 0 ? "Card fee was higher than estimated" : "Card fee was lower than estimated (credit)" },
        });
      }
    }
    await writeLedger(tx, rows, `fee-adjust:${order.id}`);
  });
  await audit(null, "fee.reconciled", "Order", order.id, { estimated, actual });
  return "adjusted";
}
