/**
 * What happens after a buyer pays. Called by the Stripe webhook
 * (checkout.session.completed) and by the mock checkout page alike.
 */
import "server-only";
import { db } from "@/lib/db";
import { splitOrder, estimateProcessingFee } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { payments } from "@/lib/payments";
import { writeLedger, type LedgerRow } from "./ledger";
import { dispatchFulfillments } from "./fulfillment";
import { notifyBuyer, notifySeller } from "./notify";

export interface PaidInput {
  orderId: string;
  paymentIntentId: string;
  chargeId?: string | null;
  /** Stripe's real fee; looked up from the charge when not given. */
  feeCents?: number | null;
}

/** Idempotent: calling it twice for the same order does nothing the second time. */
export async function markOrderPaid(input: PaidInput): Promise<{ alreadyPaid: boolean }> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { sellerOrders: { include: { items: true, fulfillments: true } } },
  });
  if (!order) throw new Error(`Order ${input.orderId} not found`);
  if (order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED") return { alreadyPaid: true };

  let chargeId = input.chargeId ?? null;
  let feeCents = input.feeCents ?? null;
  if (feeCents === null || chargeId === null) {
    try {
      const info = await payments().getChargeInfo(input.paymentIntentId);
      chargeId ??= info.chargeId;
      feeCents ??= info.feeCents;
    } catch {
      // fall back to the estimate below
    }
  }
  feeCents ??= estimateProcessingFee(order.totalCents);

  // Re-split with the actual processing fee.
  const split = splitOrder(
    order.sellerOrders.map((so) => ({
      sellerId: so.sellerId,
      itemsCents: so.itemsCents,
      shippingCents: so.shippingCents,
      partnerCostCents: so.partnerCostCents,
    })),
    { processingFeeCents: feeCents },
  );

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
      },
    });
    if (res.count === 0) return false;

    const rows: LedgerRow[] = [
      { type: "CHARGE", account: "CASH", amountCents: order.totalCents, orderId: order.id, stripeRef: input.paymentIntentId, memo: `Order ${order.number}` },
      { type: "PROCESSING_FEE", account: "CASH", amountCents: -feeCents!, orderId: order.id, stripeRef: chargeId, memo: "Stripe processing fee" },
    ];

    for (const so of order.sellerOrders) {
      const share = split.sellers.find((s) => s.sellerId === so.sellerId)!;
      await tx.sellerOrder.update({
        where: { id: so.id },
        data: {
          status: "PAID",
          payoutStatus: "HELD",
          processingFeeCents: share.processingFeeCents,
          commissionCents: share.commissionCents,
          netCents: share.netCents,
        },
      });
      const base = { sellerId: so.sellerId, orderId: order.id, sellerOrderId: so.id };
      rows.push(
        { ...base, type: "SELLER_SALE", account: "SELLER", amountCents: share.grossCents, memo: "Items + shipping" },
        { ...base, type: "COMMISSION", account: "SELLER", amountCents: -share.commissionCents, memo: "8% commission" },
        { ...base, type: "COMMISSION", account: "PLATFORM", amountCents: share.commissionCents, memo: "8% commission" },
        { ...base, type: "PROCESSING_FEE", account: "SELLER", amountCents: -share.processingFeeCents, memo: "Card processing at cost" },
      );

      for (const item of so.items) {
        await tx.listing.update({ where: { id: item.listingId }, data: { salesCount: { increment: item.quantity } } });
        await tx.listing.updateMany({
          where: { id: item.listingId, kind: "SELF_SHIP", inventory: { not: null } },
          data: { inventory: { decrement: item.quantity } },
        });
      }
    }
    await writeLedger(tx, rows);
    return true;
  });
  if (!claimed) return { alreadyPaid: true };

  await notifyBuyer(order, {
    type: "order_paid",
    title: `Order ${order.number} confirmed`,
    body: `Thanks! We received ${formatMoney(order.totalCents)}. You can follow every item on your order page.`,
  });
  for (const so of order.sellerOrders) {
    await notifySeller(so.sellerId, {
      type: "new_order",
      title: `New order ${order.number}`,
      body: `You sold ${so.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}.`,
      href: `/seller/orders/${so.id}`,
    });
  }

  await dispatchFulfillments(order.id);
  return { alreadyPaid: false };
}

/** Checkout session expired or abandoned: release the pending order. */
export async function cancelPendingOrder(orderId: string): Promise<void> {
  await db.order.updateMany({ where: { id: orderId, status: "PENDING_PAYMENT" }, data: { status: "CANCELED" } });
  await db.sellerOrder.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELED", payoutStatus: "CANCELED" } });
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
