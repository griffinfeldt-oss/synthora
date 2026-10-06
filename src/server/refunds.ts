/**
 * Refunds and disputes. A refund is always against one seller's part of an
 * order, so a multi-seller cart can be partly refunded.
 *
 * Order of events for a refund we initiate:
 *  1. Reserve the amount on the seller order (a compare-and-set on refundedCents),
 *     so two concurrent refunds can never together exceed what was paid.
 *  2. Refund the buyer through Stripe as a durable operation. A definite failure
 *     releases the reservation; an unknown outcome is left for reconciliation.
 *  3. If the seller was already paid, reverse that much of their transfer, also
 *     as an operation. If Stripe refuses (their balance is empty), the amount is
 *     recorded as a SellerReceivable and recovered from their next payouts.
 *  4. Record the ledger rows once, keyed by the refund.
 */
import "server-only";
import { FEES } from "@/config/fees";
import { db } from "@/lib/db";
import { refundImpact } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { payments } from "@/lib/payments";
import { contextFor, getProvider } from "@/fulfillment/registry";
import { writeLedger, type LedgerRow } from "./ledger";
import { audit, notifyBuyer, notifySeller } from "./notify";
import { refreshOrderStatus } from "./orders";
import { runOperation, unresolvedFor } from "./operations";
import { track } from "./analytics";

export type RefundSource = "admin" | "seller" | "stripe" | "dispute";

export class RefundError extends Error {}

async function commissionReturnedSoFar(sellerOrderId: string): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({ where: { sellerOrderId, type: "COMMISSION_REVERSAL", account: "SELLER" }, _sum: { amountCents: true } });
  return agg._sum.amountCents ?? 0;
}

export async function applyRefund(input: {
  sellerOrderId: string;
  amountCents?: number; // default: everything still refundable
  reason: string;
  source: RefundSource;
  actorId?: string | null;
  /** For refunds made outside the app: the provider's refund id, if known. */
  externalRef?: string | null;
}): Promise<{ refundedCents: number; pending?: boolean }> {
  const so = await db.sellerOrder.findUnique({
    where: { id: input.sellerOrderId },
    include: { order: true, payouts: true, fulfillments: true },
  });
  if (!so) throw new RefundError("Seller order not found");
  if (!so.order.paidAt) throw new RefundError("This order was never paid");

  const initiatedHere = input.source === "admin" || input.source === "seller";
  if (initiatedHere) {
    const open = await unresolvedFor({ sellerOrderId: so.id });
    if (open.length) throw new RefundError("A payout or refund on this order is still being confirmed with Stripe. Try again once it is resolved in the action queue.");
  }

  const grossCents = so.itemsCents + so.shippingCents;
  const impact = refundImpact(
    { grossCents, commissionCents: so.commissionCents, refundedCents: so.refundedCents, commissionReturnedCents: await commissionReturnedSoFar(so.id) },
    input.amountCents ?? grossCents - so.refundedCents,
  );
  if (impact.refundCents <= 0) return { refundedCents: 0 };

  // 1. Reserve: fails if another refund changed refundedCents since we read it.
  const before = so.refundedCents;
  const reserved = await db.sellerOrder.updateMany({
    where: { id: so.id, refundedCents: before },
    data: { refundedCents: before + impact.refundCents },
  });
  if (reserved.count === 0) throw new RefundError("Another refund on this order just went through. Refresh and check the amount.");
  const refundKey = `refund:${so.id}:${before}:${impact.refundCents}`;

  // 2. Money back to the buyer (unless Stripe already did it: dashboard refund or lost dispute).
  let refundRef: string | null = input.externalRef ?? null;
  if (initiatedHere) {
    if (!so.order.stripePaymentIntentId) {
      await db.sellerOrder.updateMany({ where: { id: so.id, refundedCents: before + impact.refundCents }, data: { refundedCents: before } });
      throw new RefundError("No payment to refund");
    }
    const pi = so.order.stripePaymentIntentId;
    const op = await runOperation({
      key: refundKey,
      kind: "refund",
      payload: { paymentIntentId: pi, amountCents: impact.refundCents, sellerOrderId: so.id, before, reason: input.reason, source: input.source, actorId: input.actorId ?? null },
      sellerId: so.sellerId,
      orderId: so.orderId,
      sellerOrderId: so.id,
      replayWindowMs: 24 * 3_600_000,
      execute: async (idempotencyKey) => {
        const r = await payments().refund({
          paymentIntentId: pi,
          amountCents: impact.refundCents,
          idempotencyKey,
          metadata: { orderId: so.orderId, sellerOrderId: so.id, reason: input.reason.slice(0, 200), opKey: refundKey },
        });
        return { ref: r.refundId };
      },
      lookup: async () => {
        const r = await payments().findRefund({ paymentIntentId: pi, opKey: refundKey });
        return r ? { ref: r.refundId } : null;
      },
    });
    if (op.status === "FAILED") {
      await db.sellerOrder.updateMany({ where: { id: so.id, refundedCents: before + impact.refundCents }, data: { refundedCents: before } });
      throw new RefundError(`Stripe refused the refund: ${op.lastError ?? "unknown reason"}`);
    }
    if (op.status !== "CONFIRMED") {
      // Reservation stays: if the refund did happen, nothing else may refund that money.
      await audit(input.actorId ?? null, "refund.unconfirmed", "SellerOrder", so.id, { amountCents: impact.refundCents, opKey: refundKey });
      return { refundedCents: 0, pending: true };
    }
    refundRef = op.providerRef;
  }
  return recordRefund({ sellerOrderId: so.id, before, impact, refundRef, reason: input.reason, source: input.source, actorId: input.actorId ?? null, refundKey });
}

/** Steps 3–5 for a refund whose money movement to the buyer is confirmed. */
export async function recordRefund(input: {
  sellerOrderId: string;
  before: number;
  impact: ReturnType<typeof refundImpact>;
  refundRef: string | null;
  reason: string;
  source: RefundSource;
  actorId: string | null;
  refundKey: string;
}): Promise<{ refundedCents: number }> {
  const { impact, before, refundKey, refundRef } = input;
  const so = await db.sellerOrder.findUniqueOrThrow({ where: { id: input.sellerOrderId }, include: { order: true, payouts: true, fulfillments: true } });
  const grossCents = so.itemsCents + so.shippingCents;

  // 3. Pull money back from the seller if they were already paid.
  const paidOut = so.payouts.filter((p) => p.status === "PAID" && p.stripeTransferId);
  let reversedCents = 0;
  let reversalRef: string | null = null;
  let debtCents = 0;
  if (so.payoutStatus === "PAID" && impact.sellerDebitCents > 0) {
    const payout = paidOut[0];
    const reversible = payout ? payout.amountCents - payout.reversedCents : 0;
    const amount = Math.min(reversible, impact.sellerDebitCents);
    debtCents = impact.sellerDebitCents - amount;
    if (amount > 0 && payout) {
      const reversalKey = `reversal:${payout.id}:${payout.reversedCents}:${amount}`;
      const op = await runOperation({
        key: reversalKey,
        kind: "reversal",
        payload: { transferId: payout.stripeTransferId, amountCents: amount, payoutId: payout.id, sellerOrderId: so.id, orderNumber: so.order.number, reason: input.reason },
        sellerId: so.sellerId,
        orderId: so.orderId,
        sellerOrderId: so.id,
        replayWindowMs: 24 * 3_600_000,
        execute: async (idempotencyKey) => {
          const rev = await payments().reverseTransfer({ transferId: payout.stripeTransferId!, amountCents: amount, idempotencyKey, metadata: { opKey: reversalKey } });
          return { ref: rev.reversalId };
        },
        lookup: async () => {
          const r = await payments().findReversal({ transferId: payout.stripeTransferId!, opKey: reversalKey });
          return r ? { ref: r.reversalId } : null;
        },
      });
      if (op.status === "CONFIRMED") {
        reversedCents = amount;
        reversalRef = op.providerRef;
        await db.payout.update({
          where: { id: payout.id },
          data: { reversedCents: { increment: amount }, status: payout.reversedCents + amount >= payout.amountCents ? "REVERSED" : "PAID" },
        });
      } else if (op.status === "FAILED") {
        debtCents += amount; // Stripe refused: the seller owes it instead.
      }
      // UNKNOWN: left in the action queue; the refund itself is recorded below.
    } else {
      debtCents = impact.sellerDebitCents;
    }
  }

  const fullyRefunded = before + impact.refundCents >= grossCents;
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

  // 4. Record it, once.
  await db.$transaction(async (tx) => {
    await tx.sellerOrder.update({
      where: { id: so.id },
      data: {
        netCents: { decrement: impact.sellerDebitCents },
        status: fullyRefunded ? "REFUNDED" : undefined,
        payoutStatus: fullyRefunded ? (so.payoutStatus === "PAID" ? "REVERSED" : so.payoutStatus === "PROCESSING" ? undefined : "CANCELED") : undefined,
      },
    });
    await tx.order.update({ where: { id: so.orderId }, data: { refundedCents: { increment: impact.refundCents } } });
    if (debtCents > 0) {
      await tx.sellerReceivable.create({
        data: { sellerId: so.sellerId, sellerOrderId: so.id, orderId: so.orderId, amountCents: debtCents, reason: `Refund after payout on order ${so.order.number}: ${input.reason}`.slice(0, 300) },
      });
    }
    if (fullyRefunded) {
      await tx.entitlement.updateMany({ where: { orderItem: { sellerOrderId: so.id }, status: "ACTIVE" }, data: { status: "REVOKED", revokedReason: "Refunded" } });
    }
    await writeLedger(tx, rows, refundKey);
  });

  // 5. Stop production if nothing has shipped.
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
  await audit(input.actorId ?? null, `refund.${input.source}`, "SellerOrder", so.id, { amountCents: impact.refundCents, reason: input.reason, debtCents });
  await track({ name: "refund_confirmed", orderId: so.orderId, dedupeKey: `refund_confirmed:${refundKey}`, isTest: so.order.mode !== "live", props: { amountCents: impact.refundCents, source: input.source } });
  await notifyBuyer(so.order, {
    type: "refund",
    title: `Refund of ${formatMoney(impact.refundCents)} on order ${so.order.number}`,
    body: `We refunded ${formatMoney(impact.refundCents)} to your original payment method. It can take 5–10 days to appear.`,
  });
  await notifySeller(so.sellerId, {
    type: "refund",
    title: `Refund on order ${so.order.number}`,
    body: [
      `${formatMoney(impact.refundCents)} was refunded (${input.reason}). Your earnings for this order went down by ${formatMoney(impact.sellerDebitCents)}.`,
      reversedCents > 0 ? `We took back ${formatMoney(reversedCents)} from the payout you already received.` : "",
      debtCents > 0
        ? FEES.refunds.recoverDebtFromFuturePayouts
          ? `${formatMoney(debtCents)} could not be taken back from your Stripe balance, so it will be deducted from your next payouts.`
          : `${formatMoney(debtCents)} could not be taken back from your Stripe balance. We'll contact you about it.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    href: `/seller/orders/${so.id}`,
  });
  return { refundedCents: impact.refundCents };
}

/** Finish an uncertain refund once its outcome is known (lookup, replay or a person). */
export async function settleRefundOperation(opId: string): Promise<"recorded" | "released" | "unresolved"> {
  const op = await db.operation.findUniqueOrThrow({ where: { id: opId } });
  const p = op.payload as { paymentIntentId: string; amountCents: number; sellerOrderId: string; before: number; reason: string; source: RefundSource; actorId: string | null };
  if (op.status === "FAILED") {
    await db.sellerOrder.updateMany({ where: { id: p.sellerOrderId, refundedCents: { gte: p.amountCents } }, data: { refundedCents: { decrement: p.amountCents } } });
    await audit(op.resolvedById, "refund.released", "SellerOrder", p.sellerOrderId, { opKey: op.key });
    return "released";
  }
  if (op.status !== "CONFIRMED") return "unresolved";
  const already = await db.ledgerEntry.count({ where: { opKey: op.key } });
  if (already) return "recorded";
  const so = await db.sellerOrder.findUniqueOrThrow({ where: { id: p.sellerOrderId } });
  const impact = refundImpact(
    { grossCents: so.itemsCents + so.shippingCents, commissionCents: so.commissionCents, refundedCents: p.before, commissionReturnedCents: await commissionReturnedSoFar(so.id) },
    p.amountCents,
  );
  await recordRefund({ sellerOrderId: so.id, before: p.before, impact, refundRef: op.providerRef, reason: p.reason, source: p.source, actorId: p.actorId, refundKey: op.key });
  return "recorded";
}

/** Settle a transfer reversal whose outcome was uncertain when the refund was recorded. */
export async function settleReversalOperation(opId: string): Promise<"recorded" | "debt" | "unresolved"> {
  const op = await db.operation.findUniqueOrThrow({ where: { id: opId } });
  const p = op.payload as { transferId: string; amountCents: number; payoutId: string; sellerOrderId: string; orderNumber: string; reason: string };
  const so = await db.sellerOrder.findUniqueOrThrow({ where: { id: p.sellerOrderId } });
  if (op.status === "CONFIRMED") {
    if (await db.ledgerEntry.count({ where: { opKey: op.key } })) return "recorded";
    await db.$transaction(async (tx) => {
      const payout = await tx.payout.findUniqueOrThrow({ where: { id: p.payoutId } });
      await tx.payout.update({ where: { id: payout.id }, data: { reversedCents: { increment: p.amountCents }, status: payout.reversedCents + p.amountCents >= payout.amountCents ? "REVERSED" : "PAID" } });
      const base = { sellerId: so.sellerId, orderId: so.orderId, sellerOrderId: so.id };
      await writeLedger(
        tx,
        [
          { ...base, type: "TRANSFER_REVERSAL", account: "SELLER", amountCents: p.amountCents, stripeRef: op.providerRef, memo: "Pulled back from seller" },
          { ...base, type: "TRANSFER_REVERSAL", account: "CASH", amountCents: p.amountCents, stripeRef: op.providerRef, memo: "Pulled back from seller" },
        ],
        op.key,
      );
    });
    return "recorded";
  }
  if (op.status === "FAILED") {
    const exists = await db.sellerReceivable.count({ where: { sellerOrderId: so.id, reason: { contains: op.key } } });
    if (!exists) {
      await db.sellerReceivable.create({
        data: { sellerId: so.sellerId, sellerOrderId: so.id, orderId: so.orderId, amountCents: p.amountCents, reason: `Refund after payout on order ${p.orderNumber}: reversal refused (${op.key})` },
      });
      await notifySeller(so.sellerId, {
        type: "refund_debt",
        title: `Refund on order ${p.orderNumber}`,
        body: `${formatMoney(p.amountCents)} from a refund could not be taken back from your Stripe balance, so it will be deducted from your next payouts.`,
        href: `/seller/orders/${so.id}`,
      });
    }
    return "debt";
  }
  return "unresolved";
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
 * charge.refunded webhook: a refund made outside the app (e.g. Stripe dashboard),
 * or the confirmation of one we made. Records only what we have not recorded.
 */
export async function syncExternalRefund(paymentIntentId: string, totalRefundedCents: number): Promise<void> {
  const order = await db.order.findUnique({ where: { stripePaymentIntentId: paymentIntentId }, include: { sellerOrders: true } });
  if (!order) return;
  // Refunds we started but have not recorded yet are already reserved on the seller orders.
  const reserved = order.sellerOrders.reduce((a, so) => a + so.refundedCents, 0);
  let missing = totalRefundedCents - Math.max(order.refundedCents, reserved);
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
    await writeLedger(
      tx,
      [{ type: "DISPUTE", account: "CASH", amountCents: -input.amountCents, orderId: order.id, stripeRef: input.disputeId, memo: `Dispute opened: ${input.reason ?? "unknown"}` }],
      `dispute-open:${input.disputeId}`,
    );
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
  const claimed = await db.dispute.updateMany({ where: { id: dispute.id, status: "OPEN" }, data: { status: input.won ? "WON" : "LOST" } });
  if (claimed.count === 0) return;

  if (input.won) {
    await db.$transaction(async (tx) => {
      await tx.sellerOrder.updateMany({ where: { orderId: dispute.orderId, payoutStatus: "BLOCKED" }, data: { payoutStatus: "HELD" } });
      await writeLedger(
        tx,
        [{ type: "DISPUTE", account: "CASH", amountCents: dispute.amountCents, orderId: dispute.orderId, stripeRef: input.disputeId, memo: "Dispute won, funds returned" }],
        `dispute-won:${input.disputeId}`,
      );
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
