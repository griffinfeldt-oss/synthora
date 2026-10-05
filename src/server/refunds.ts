/**
 * Refunds and disputes. A refund is always against one seller's part of an
 * order, so a multi-seller cart can be partly refunded.
 *
 * If the seller has not been paid yet we simply pay them less. If they have,
 * we reverse that much of their transfer.
 */
import "server-only";
import { db } from "@/lib/db";
import { refundImpact } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { payments } from "@/lib/payments";
import { contextFor, getProvider } from "@/fulfillment/registry";
import { writeLedger, type LedgerRow } from "./ledger";
import { audit, notifyBuyer, notifySeller } from "./notify";
import { refreshOrderStatus } from "./orders";

export type RefundSource = "admin" | "seller" | "stripe" | "dispute";

export async function applyRefund(input: {
  sellerOrderId: string;
  amountCents?: number; // default: everything still refundable
  reason: string;
  source: RefundSource;
  actorId?: string | null;
}): Promise<{ refundedCents: number }> {
  const so = await db.sellerOrder.findUnique({
    where: { id: input.sellerOrderId },
    include: { order: true, payouts: true, fulfillments: true },
  });
  if (!so) throw new Error("Seller order not found");
  if (!so.order.paidAt) throw new Error("This order was never paid");

  const grossCents = so.itemsCents + so.shippingCents;
  const impact = refundImpact(
    { grossCents, commissionCents: so.commissionCents, refundedCents: so.refundedCents },
    input.amountCents ?? grossCents - so.refundedCents,
  );
  if (impact.refundCents <= 0) return { refundedCents: 0 };

  // 1. Money back to the buyer (unless Stripe already did it: dashboard refund or lost dispute).
  let refundRef: string | null = null;
  if (input.source === "admin" || input.source === "seller") {
    if (!so.order.stripePaymentIntentId) throw new Error("No payment to refund");
    const r = await payments().refund({
      paymentIntentId: so.order.stripePaymentIntentId,
      amountCents: impact.refundCents,
      idempotencyKey: `refund-${so.id}-${so.refundedCents}-${impact.refundCents}`,
      metadata: { orderId: so.orderId, sellerOrderId: so.id, reason: input.reason.slice(0, 200) },
    });
    refundRef = r.refundId;
  }

  // 2. Pull money back from the seller if they were already paid.
  const paidOut = so.payouts.filter((p) => p.status === "PAID" && p.stripeTransferId);
  let reversedCents = 0;
  let reversalRef: string | null = null;
  if (so.payoutStatus === "PAID" && paidOut.length && impact.sellerDebitCents > 0) {
    const payout = paidOut[0];
    const reversible = payout.amountCents - payout.reversedCents;
    const amount = Math.min(reversible, impact.sellerDebitCents);
    if (amount > 0) {
      try {
        const rev = await payments().reverseTransfer({
          transferId: payout.stripeTransferId!,
          amountCents: amount,
          idempotencyKey: `reverse-${payout.id}-${payout.reversedCents}-${amount}`,
        });
        reversedCents = amount;
        reversalRef = rev.reversalId;
        await db.payout.update({
          where: { id: payout.id },
          data: { reversedCents: { increment: amount }, status: payout.reversedCents + amount >= payout.amountCents ? "REVERSED" : "PAID" },
        });
      } catch (e) {
        await notifySeller(so.sellerId, {
          type: "reversal_failed",
          title: "Refund could not be recovered",
          body: `We could not pull back ${formatMoney(amount)} for a refund on order ${so.order.number}. It will be deducted from your next payout.`,
          href: "/seller/payouts",
        });
        void e;
      }
    }
  }

  const fullyRefunded = so.refundedCents + impact.refundCents >= grossCents;
  const base = { sellerId: so.sellerId, orderId: so.orderId, sellerOrderId: so.id };
  const rows: LedgerRow[] = [
    { ...base, type: "REFUND", account: "SELLER", amountCents: -impact.refundCents, stripeRef: refundRef, memo: input.reason },
    { ...base, type: "COMMISSION_REVERSAL", account: "SELLER", amountCents: impact.commissionReturnedCents, memo: "Commission returned" },
    { ...base, type: "COMMISSION_REVERSAL", account: "PLATFORM", amountCents: -impact.commissionReturnedCents, memo: "Commission returned" },
  ];
  // A lost dispute already took the cash when it opened (see onDisputeCreated).
  if (input.source !== "dispute") {
    rows.push({ ...base, type: "REFUND", account: "CASH", amountCents: -impact.refundCents, stripeRef: refundRef, memo: input.reason });
  }
  if (reversedCents > 0) {
    rows.push(
      { ...base, type: "TRANSFER_REVERSAL", account: "SELLER", amountCents: reversedCents, stripeRef: reversalRef, memo: "Pulled back from seller" },
      { ...base, type: "TRANSFER_REVERSAL", account: "CASH", amountCents: reversedCents, stripeRef: reversalRef, memo: "Pulled back from seller" },
    );
  }

  await db.$transaction(async (tx) => {
    await tx.sellerOrder.update({
      where: { id: so.id },
      data: {
        refundedCents: { increment: impact.refundCents },
        netCents: { decrement: impact.sellerDebitCents },
        status: fullyRefunded ? "REFUNDED" : undefined,
        payoutStatus: fullyRefunded ? (so.payoutStatus === "PAID" ? "REVERSED" : "CANCELED") : undefined,
      },
    });
    await tx.order.update({ where: { id: so.orderId }, data: { refundedCents: { increment: impact.refundCents } } });
    await writeLedger(tx, rows);
  });

  // 3. Stop production if nothing has shipped.
  if (fullyRefunded) {
    for (const f of so.fulfillments) {
      if (!f.partnerOrderId || ["SHIPPED", "DELIVERED", "CANCELED"].includes(f.status)) continue;
      const connection = f.connectionId ? await db.partnerConnection.findUnique({ where: { id: f.connectionId } }) : null;
      const res = await getProvider(f.provider)
        .cancel(contextFor(connection), f.partnerOrderId)
        .catch(() => ({ canceled: false }));
      if (res.canceled) await db.fulfillment.update({ where: { id: f.id }, data: { status: "CANCELED" } });
    }
  }

  await refreshOrderStatus(so.orderId);
  await audit(input.actorId ?? null, `refund.${input.source}`, "SellerOrder", so.id, { amountCents: impact.refundCents, reason: input.reason });
  await notifyBuyer(so.order, {
    type: "refund",
    title: `Refund of ${formatMoney(impact.refundCents)} on order ${so.order.number}`,
    body: `We refunded ${formatMoney(impact.refundCents)} to your original payment method. It can take 5–10 days to appear.`,
  });
  await notifySeller(so.sellerId, {
    type: "refund",
    title: `Refund on order ${so.order.number}`,
    body: `${formatMoney(impact.refundCents)} was refunded (${input.reason}). Your earnings for this order went down by ${formatMoney(impact.sellerDebitCents)}.`,
    href: `/seller/orders/${so.id}`,
  });
  return { refundedCents: impact.refundCents };
}

/** Refund everything left on an order, across all sellers. */
export async function refundWholeOrder(orderId: string, reason: string, actorId: string | null): Promise<number> {
  const sos = await db.sellerOrder.findMany({ where: { orderId } });
  let total = 0;
  for (const so of sos) {
    total += (await applyRefund({ sellerOrderId: so.id, reason, source: "admin", actorId })).refundedCents;
  }
  return total;
}

/**
 * charge.refunded webhook: a refund made outside the app (e.g. Stripe dashboard).
 * Spreads any amount we have not recorded across the order's sellers.
 */
export async function syncExternalRefund(paymentIntentId: string, totalRefundedCents: number): Promise<void> {
  const order = await db.order.findUnique({ where: { stripePaymentIntentId: paymentIntentId }, include: { sellerOrders: true } });
  if (!order) return;
  let missing = totalRefundedCents - order.refundedCents;
  for (const so of order.sellerOrders) {
    if (missing <= 0) break;
    const room = so.itemsCents + so.shippingCents - so.refundedCents;
    const amount = Math.min(room, missing);
    if (amount > 0) {
      await applyRefund({ sellerOrderId: so.id, amountCents: amount, reason: "Refunded in Stripe", source: "stripe" });
      missing -= amount;
    }
  }
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export async function onDisputeCreated(input: {
  paymentIntentId: string;
  disputeId: string;
  amountCents: number;
  reason: string | null;
}): Promise<void> {
  const order = await db.order.findUnique({ where: { stripePaymentIntentId: input.paymentIntentId } });
  if (!order) return;
  const existing = await db.dispute.findUnique({ where: { stripeDisputeId: input.disputeId } });
  if (existing) return;
  await db.$transaction(async (tx) => {
    await tx.dispute.create({
      data: { orderId: order.id, stripeDisputeId: input.disputeId, amountCents: input.amountCents, reason: input.reason },
    });
    await tx.sellerOrder.updateMany({
      where: { orderId: order.id, payoutStatus: { in: ["HELD", "ELIGIBLE"] } },
      data: { payoutStatus: "BLOCKED" },
    });
    await writeLedger(tx, [
      { type: "DISPUTE", account: "CASH", amountCents: -input.amountCents, orderId: order.id, stripeRef: input.disputeId, memo: `Dispute opened: ${input.reason ?? "unknown"}` },
    ]);
  });
  await refreshOrderStatus(order.id);
  const sos = await db.sellerOrder.findMany({ where: { orderId: order.id } });
  for (const so of sos) {
    await notifySeller(so.sellerId, {
      type: "dispute",
      title: `Payment disputed on order ${order.number}`,
      body: "The buyer's bank opened a dispute. Payouts for this order are on hold while it is reviewed. We may ask you for tracking or other evidence.",
      href: `/seller/orders/${so.id}`,
    });
  }
}

export async function onDisputeClosed(input: { disputeId: string; won: boolean }): Promise<void> {
  const dispute = await db.dispute.findUnique({ where: { stripeDisputeId: input.disputeId }, include: { order: true } });
  if (!dispute || dispute.status !== "OPEN") return;
  await db.dispute.update({ where: { id: dispute.id }, data: { status: input.won ? "WON" : "LOST" } });

  if (input.won) {
    await db.$transaction(async (tx) => {
      await tx.sellerOrder.updateMany({ where: { orderId: dispute.orderId, payoutStatus: "BLOCKED" }, data: { payoutStatus: "HELD" } });
      await writeLedger(tx, [
        { type: "DISPUTE", account: "CASH", amountCents: dispute.amountCents, orderId: dispute.orderId, stripeRef: input.disputeId, memo: "Dispute won, funds returned" },
      ]);
    });
  } else {
    // Lost: the buyer keeps the money. Account for it like a refund, spread across sellers.
    let remaining = dispute.amountCents;
    const sos = await db.sellerOrder.findMany({ where: { orderId: dispute.orderId } });
    for (const so of sos) {
      if (remaining <= 0) break;
      const room = so.itemsCents + so.shippingCents - so.refundedCents;
      const amount = Math.min(room, remaining);
      if (amount > 0) {
        await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: so.payoutStatus === "BLOCKED" ? "HELD" : so.payoutStatus } });
        await applyRefund({ sellerOrderId: so.id, amountCents: amount, reason: "Chargeback lost", source: "dispute" });
        remaining -= amount;
      }
    }
  }
  await refreshOrderStatus(dispute.orderId);
}
