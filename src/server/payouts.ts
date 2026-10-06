/**
 * Releasing held money to sellers. Runs from the cron route (daily), and admins
 * can run it on demand.
 *
 * A seller order is marked PAID only after Stripe confirms the transfer. Until
 * then it is PROCESSING; an uncertain transfer stays PROCESSING and is recovered
 * by looking it up at Stripe (or replaying the same idempotency key) on the next
 * run, or resolved by a person. Eligibility is re-checked at the moment of paying.
 */
import "server-only";
import type { SellerReceivable } from "@prisma/client";
import { FEES } from "@/config/fees";
import { db } from "@/lib/db";
import { isLive } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { payments } from "@/lib/payments";
import { writeLedger, type LedgerRow } from "./ledger";
import { notifySeller } from "./notify";
import { refreshOrderStatus } from "./orders";
import { runOperation, unresolvedFor } from "./operations";

export interface PayoutRunResult {
  paid: number;
  blocked: number;
  failed: number;
  pending: number;
  totalCents: number;
}

export async function releaseDuePayouts(now = new Date()): Promise<PayoutRunResult> {
  const due = await db.sellerOrder.findMany({
    where: {
      OR: [
        { payoutStatus: { in: ["HELD", "ELIGIBLE", "BLOCKED"] }, payoutEligibleAt: { lte: now } },
        // Transfers whose outcome we have not confirmed yet.
        { payoutStatus: "PROCESSING" },
      ],
      order: { paidAt: { not: null } },
    },
    select: { id: true },
    take: 200,
  });

  const result: PayoutRunResult = { paid: 0, blocked: 0, failed: 0, pending: 0, totalCents: 0 };
  for (const so of due) {
    const outcome = await payOutSellerOrder(so.id);
    if (outcome.status === "paid") {
      result.paid++;
      result.totalCents += outcome.amountCents;
    } else if (outcome.status === "blocked") result.blocked++;
    else if (outcome.status === "failed") result.failed++;
    else if (outcome.status === "pending") result.pending++;
  }
  return result;
}

/** Why this seller order must not be paid right now, or null. */
async function payoutBlocker(so: {
  id: string;
  orderId: string;
  seller: { status: string; stripeAccountId: string | null; payoutsEnabled: boolean; payoutsHaltedAt: Date | null; payoutsHaltedReason: string | null; isTest: boolean };
}): Promise<{ reason: string; sellerMessage: string } | null> {
  const s = so.seller;
  if (s.status === "SUSPENDED") return { reason: "Shop suspended", sellerMessage: "Payouts are on hold while your shop is suspended." };
  if (!s.stripeAccountId || !s.payoutsEnabled) return { reason: "Payouts not set up", sellerMessage: "Finish Stripe onboarding so we can send your earnings." };
  if (s.payoutsHaltedAt) return { reason: `Payouts halted: ${s.payoutsHaltedReason ?? "under review"}`, sellerMessage: "Payouts are paused while we check a difference in our records. We'll be in touch." };
  if (s.isTest && isLive()) return { reason: "Demo shop", sellerMessage: "Demo shops cannot receive real payouts." };
  const dispute = await db.dispute.count({ where: { orderId: so.orderId, status: "OPEN" } });
  if (dispute) return { reason: "Open dispute", sellerMessage: "This order's payment is disputed, so its payout is on hold." };
  const unresolved = (await unresolvedFor({ sellerOrderId: so.id })).filter((o) => o.kind !== "transfer");
  if (unresolved.length) return { reason: "Refund or reversal being confirmed", sellerMessage: "A refund on this order is still being confirmed." };
  return null;
}

function outstanding(r: SellerReceivable): number {
  return r.amountCents - r.recoveredCents;
}

export type PayoutOutcome = { status: "paid" | "blocked" | "failed" | "pending" | "skipped"; amountCents: number };

export async function payOutSellerOrder(sellerOrderId: string): Promise<PayoutOutcome> {
  const so = await db.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: { seller: true, order: true },
  });
  if (!so || ["PAID", "REVERSED", "CANCELED", "NOT_READY"].includes(so.payoutStatus)) return { status: "skipped", amountCents: 0 };
  const seller = so.seller;

  // A transfer already in flight is only ever recovered, never re-decided.
  const inFlight = so.payoutStatus === "PROCESSING";
  if (!inFlight) {
    const blocker = await payoutBlocker(so);
    if (blocker) {
      if (so.payoutStatus !== "BLOCKED") {
        await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "BLOCKED" } });
        await notifySeller(seller.id, { type: "payout_blocked", title: "A payout is waiting for you", body: blocker.sellerMessage, href: "/seller/payouts" });
      }
      return { status: "blocked", amountCents: 0 };
    }
  }

  // Debts and credits from other orders settle against this payout.
  const receivables = FEES.refunds.recoverDebtFromFuturePayouts
    ? await db.sellerReceivable.findMany({ where: { sellerId: seller.id, status: "OPEN", NOT: { sellerOrderId: so.id } }, orderBy: { createdAt: "asc" } })
    : [];
  const balance = receivables.reduce((a, r) => a + outstanding(r), 0);
  const offsetCents = balance > 0 ? Math.min(balance, Math.max(0, so.netCents)) : balance; // negative = credit owed to the seller
  const amount = so.netCents - offsetCents;

  if (!inFlight) {
    if (so.netCents <= 0 && offsetCents >= 0) {
      await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "CANCELED" } });
      return { status: "skipped", amountCents: 0 };
    }
    // Claim before calling Stripe so two runs cannot both pay.
    const claim = await db.sellerOrder.updateMany({
      where: { id: so.id, payoutStatus: { in: ["HELD", "ELIGIBLE", "BLOCKED"] } },
      data: { payoutStatus: "PROCESSING" },
    });
    if (claim.count === 0) return { status: "skipped", amountCents: 0 };
  }

  const opKey = `transfer:${so.id}`;
  const existing = await db.operation.findUnique({ where: { key: opKey } });
  // Recover with the terms that were sent, not today's numbers.
  const payload = (existing && existing.status !== "FAILED" ? existing.payload : { amountCents: amount, offsetCents, destination: seller.stripeAccountId }) as { amountCents: number; offsetCents: number; destination: string };

  let transferRef: string | null = null;
  if (payload.amountCents > 0) {
    const op = await runOperation({
      key: opKey,
      kind: "transfer",
      payload,
      sellerId: seller.id,
      orderId: so.orderId,
      sellerOrderId: so.id,
      replayWindowMs: 24 * 3_600_000,
      execute: async (idempotencyKey) => {
        const t = await payments().createTransfer({
          amountCents: payload.amountCents,
          destinationAccountId: payload.destination,
          transferGroup: so.orderId,
          sourceChargeId: so.order.stripeChargeId,
          idempotencyKey,
          metadata: { sellerOrderId: so.id, orderId: so.orderId, orderNumber: so.order.number, opKey },
        });
        return { ref: t.transferId };
      },
      lookup: async () => {
        const t = await payments().findTransfer({ transferGroup: so.orderId, opKey });
        return t ? { ref: t.transferId } : null;
      },
    });
    if (op.status === "FAILED") {
      await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "ELIGIBLE" } });
      await db.payout.create({
        data: { sellerId: seller.id, sellerOrderId: so.id, amountCents: payload.amountCents, status: "FAILED", failureReason: op.lastError ?? "Transfer failed", operationId: op.id },
      });
      return { status: "failed", amountCents: 0 };
    }
    if (op.status !== "CONFIRMED") return { status: "pending", amountCents: 0 };
    transferRef = op.providerRef;
  }

  // Confirmed (or nothing to transfer because debt covered it): record it once.
  const done = await db.$transaction(async (tx) => {
    const res = await tx.sellerOrder.updateMany({ where: { id: so.id, payoutStatus: "PROCESSING" }, data: { payoutStatus: "PAID", status: "COMPLETED", completedAt: new Date() } });
    if (res.count === 0) return false;
    const op = await tx.operation.findUnique({ where: { key: opKey } });
    await tx.payout.create({
      data: { sellerId: seller.id, sellerOrderId: so.id, amountCents: payload.amountCents, offsetCents: payload.offsetCents, stripeTransferId: transferRef, status: "PAID", operationId: op?.id },
    });
    const base = { sellerId: seller.id, orderId: so.orderId, sellerOrderId: so.id };
    const rows: LedgerRow[] = [];
    if (payload.amountCents) {
      rows.push(
        { ...base, type: "PAYOUT", account: "SELLER", amountCents: -payload.amountCents, stripeRef: transferRef, memo: "Transfer to seller" },
        { ...base, type: "PAYOUT", account: "CASH", amountCents: -payload.amountCents, stripeRef: transferRef, memo: "Transfer to seller" },
      );
    }
    // Move the settled debt (or credit) from this order to the orders it came from.
    let left = payload.offsetCents;
    if (left !== 0) {
      rows.push({ ...base, type: "DEBT_OFFSET", account: "SELLER", amountCents: -left, memo: left > 0 ? "Recovered seller debt" : "Credit paid to seller" });
      for (const r of receivables) {
        if (left === 0) break;
        const take = left > 0 ? Math.min(left, Math.max(0, outstanding(r))) : Math.max(left, Math.min(0, outstanding(r)));
        if (take === 0) continue;
        left -= take;
        await tx.sellerReceivable.update({
          where: { id: r.id },
          data: { recoveredCents: { increment: take }, status: outstanding(r) - take === 0 ? "RECOVERED" : "OPEN" },
        });
        rows.push({ type: "DEBT_OFFSET", account: "SELLER", amountCents: take, sellerId: seller.id, orderId: r.orderId, sellerOrderId: r.sellerOrderId, memo: "Settled from a later payout" });
      }
    }
    await writeLedger(tx, rows, `payout:${so.id}`);
    // A refund that raced the transfer leaves the seller overpaid: record it as debt.
    const fresh = await tx.sellerOrder.findUniqueOrThrow({ where: { id: so.id } });
    const overpaid = payload.amountCents + payload.offsetCents - fresh.netCents;
    if (overpaid > 0) {
      await tx.sellerReceivable.create({ data: { sellerId: seller.id, sellerOrderId: so.id, orderId: so.orderId, amountCents: overpaid, reason: "Refunded while the payout was being sent" } });
    }
    return true;
  });
  if (!done) return { status: "skipped", amountCents: 0 };

  await notifySeller(seller.id, {
    type: "payout_sent",
    title: `Payout sent: ${formatMoney(payload.amountCents)}`,
    body:
      payload.offsetCents > 0
        ? `We sent ${formatMoney(payload.amountCents)} for order ${so.order.number}, after recovering ${formatMoney(payload.offsetCents)} you owed from an earlier refund.`
        : `We sent ${formatMoney(payload.amountCents)} for order ${so.order.number} to your Stripe account.`,
    href: "/seller/payouts",
  });
  await refreshOrderStatus(so.orderId);
  return { status: "paid", amountCents: payload.amountCents };
}

/** Seller-facing balance summary. */
export async function sellerBalances(sellerId: string) {
  const [held, eligible, processing, paid, refunds, owed] = await Promise.all([
    db.sellerOrder.aggregate({ where: { sellerId, payoutStatus: { in: ["HELD", "BLOCKED"] } }, _sum: { netCents: true } }),
    db.sellerOrder.aggregate({ where: { sellerId, payoutStatus: "ELIGIBLE" }, _sum: { netCents: true } }),
    db.sellerOrder.aggregate({ where: { sellerId, payoutStatus: "PROCESSING" }, _sum: { netCents: true } }),
    db.payout.aggregate({ where: { sellerId, status: "PAID" }, _sum: { amountCents: true, reversedCents: true } }),
    db.sellerOrder.aggregate({ where: { sellerId }, _sum: { refundedCents: true } }),
    db.sellerReceivable.findMany({ where: { sellerId, status: "OPEN" } }),
  ]);
  return {
    heldCents: held._sum.netCents ?? 0,
    eligibleCents: eligible._sum.netCents ?? 0,
    processingCents: processing._sum.netCents ?? 0,
    paidCents: (paid._sum.amountCents ?? 0) - (paid._sum.reversedCents ?? 0),
    refundedCents: refunds._sum.refundedCents ?? 0,
    /** Positive: the seller owes this and it comes off the next payout. */
    owedCents: owed.reduce((a, r) => a + r.amountCents - r.recoveredCents, 0),
  };
}
