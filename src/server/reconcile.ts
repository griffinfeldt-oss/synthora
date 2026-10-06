/**
 * Daily reconciliation: compare our ledger and order records with the payment
 * processor, and with themselves. Any difference is listed on the run, and the
 * sellers it touches have payouts halted until a person clears it.
 *
 * Checks:
 *  - each paid order's CASH charge equals its total, and the ledger balances
 *  - each seller order's SELLER balance equals net − paid out + reversed (+ debt
 *    recovered or − debt outstanding)
 *  - Stripe (test/live): amount received, amount refunded and fee match the order;
 *    each recorded transfer exists with the same amount and reversals
 *  - no money operation has been unresolved for more than a few hours
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { payments } from "@/lib/payments";
import { audit } from "./notify";

export interface Difference {
  kind: string;
  detail: string;
  orderId?: string;
  sellerOrderId?: string;
  sellerId?: string;
  expected?: number | string | null;
  actual?: number | string | null;
}

async function sum(where: Prisma.LedgerEntryWhereInput): Promise<number> {
  return (await db.ledgerEntry.aggregate({ where, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
}

export async function runReconciliation(opts: { since?: Date; until?: Date; haltPayouts?: boolean } = {}) {
  const until = opts.until ?? new Date();
  const since = opts.since ?? new Date(until.getTime() - 35 * 86_400_000);
  const run = await db.reconciliationRun.create({ data: { windowStart: since, windowEnd: until } });
  const diffs: Difference[] = [];
  let checked = 0;

  try {
    const orders = await db.order.findMany({
      where: { paidAt: { gte: since, lte: until } },
      include: { sellerOrders: { include: { payouts: true } } },
    });
    for (const order of orders) {
      checked++;
      const charge = await sum({ orderId: order.id, type: "CHARGE", account: "CASH" });
      if (charge !== order.totalCents) diffs.push({ kind: "charge_vs_total", detail: `Order ${order.number}: ledger charge ≠ order total`, orderId: order.id, expected: order.totalCents, actual: charge });

      for (const so of order.sellerOrders) {
        const sellerBalance = await sum({ sellerOrderId: so.id, account: "SELLER" });
        const paidOut = so.payouts.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amountCents + p.offsetCents, 0);
        const reversed = so.payouts.reduce((a, p) => a + p.reversedCents, 0);
        const receivables = await db.sellerReceivable.findMany({ where: { sellerOrderId: so.id } });
        const recovered = receivables.reduce((a, r) => a + r.recoveredCents, 0);
        const writtenOff = receivables.filter((r) => r.status === "WRITTEN_OFF").reduce((a, r) => a + r.amountCents - r.recoveredCents, 0);
        // Unpaid: we owe the seller their net. Paid: what is left after transfers,
        // reversals and debt settled or written off (negative while debt is outstanding).
        const settled = so.payoutStatus === "PAID" || so.payoutStatus === "REVERSED";
        const target = settled ? so.netCents - paidOut + reversed + recovered + writtenOff : so.netCents;
        if (so.status !== "PENDING" && so.status !== "CANCELED" && sellerBalance !== target) {
          diffs.push({ kind: "seller_balance", detail: `Order ${order.number}: seller ledger balance does not match payouts and debts`, orderId: order.id, sellerOrderId: so.id, sellerId: so.sellerId, expected: target, actual: sellerBalance });
        }
      }

      if (!mock.stripe && order.stripePaymentIntentId && order.mode !== "demo") {
        const summary = await payments().getPaymentSummary(order.stripePaymentIntentId).catch(() => null);
        if (!summary) {
          diffs.push({ kind: "stripe_unreachable", detail: `Order ${order.number}: could not read the payment from Stripe`, orderId: order.id });
        } else {
          if (summary.amountReceivedCents !== order.totalCents) diffs.push({ kind: "stripe_amount", detail: `Order ${order.number}: Stripe received a different amount`, orderId: order.id, expected: order.totalCents, actual: summary.amountReceivedCents });
          if (summary.amountRefundedCents !== order.refundedCents) diffs.push({ kind: "stripe_refunds", detail: `Order ${order.number}: refunds differ from Stripe`, orderId: order.id, expected: order.refundedCents, actual: summary.amountRefundedCents });
          if (summary.feeCents !== null && order.processingFeeStatus === "ACTUAL" && summary.feeCents !== order.processingFeeCents) {
            diffs.push({ kind: "stripe_fee", detail: `Order ${order.number}: card fee differs from Stripe`, orderId: order.id, expected: order.processingFeeCents, actual: summary.feeCents });
          }
        }
        for (const so of order.sellerOrders) {
          for (const p of so.payouts.filter((x) => x.status !== "FAILED" && x.stripeTransferId)) {
            const t = await payments().getTransferSummary(p.stripeTransferId!).catch(() => null);
            if (!t) diffs.push({ kind: "transfer_missing", detail: `Order ${order.number}: transfer ${p.stripeTransferId} not found at Stripe`, orderId: order.id, sellerOrderId: so.id, sellerId: so.sellerId });
            else if (t.amountCents !== p.amountCents || t.reversedCents !== p.reversedCents) {
              diffs.push({ kind: "transfer_amount", detail: `Order ${order.number}: transfer amount or reversals differ from Stripe`, orderId: order.id, sellerOrderId: so.id, sellerId: so.sellerId, expected: `${p.amountCents}/${p.reversedCents}`, actual: `${t.amountCents}/${t.reversedCents}` });
            }
          }
        }
      }
    }

    // Operations nobody has resolved.
    const stuck = await db.operation.findMany({ where: { status: { in: ["UNKNOWN", "PROCESSING"] }, updatedAt: { lt: new Date(until.getTime() - 3 * 3_600_000) } } });
    for (const op of stuck) {
      diffs.push({ kind: "unresolved_operation", detail: `${op.kind} ${op.key} has been ${op.status.toLowerCase()} since ${op.updatedAt.toISOString()}`, orderId: op.orderId ?? undefined, sellerOrderId: op.sellerOrderId ?? undefined, sellerId: op.sellerId ?? undefined });
    }

    // Halt payouts for every seller a difference touches.
    const sellerIds = new Set<string>();
    for (const d of diffs) {
      if (d.sellerId) sellerIds.add(d.sellerId);
      else if (d.orderId) for (const so of await db.sellerOrder.findMany({ where: { orderId: d.orderId }, select: { sellerId: true } })) sellerIds.add(so.sellerId);
    }
    if (opts.haltPayouts !== false && sellerIds.size) {
      await db.seller.updateMany({
        where: { id: { in: [...sellerIds] }, payoutsHaltedAt: null },
        data: { payoutsHaltedAt: new Date(), payoutsHaltedReason: `Reconciliation run ${run.id} found a difference` },
      });
    }

    const finished = await db.reconciliationRun.update({
      where: { id: run.id },
      data: { status: diffs.length ? "DIFFERENCES" : "OK", checked, differences: diffs as unknown as Prisma.InputJsonValue, haltedSellerIds: [...sellerIds], finishedAt: new Date() },
    });
    await audit(null, "reconciliation.run", "ReconciliationRun", run.id, { checked, differences: diffs.length });
    return finished;
  } catch (e) {
    return db.reconciliationRun.update({ where: { id: run.id }, data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "failed", finishedAt: new Date(), checked } });
  }
}

/** Admin clears a halt after resolving the cause. */
export async function clearPayoutHalt(adminId: string, sellerId: string, note: string): Promise<void> {
  await db.seller.update({ where: { id: sellerId }, data: { payoutsHaltedAt: null, payoutsHaltedReason: null } });
  await db.sellerOrder.updateMany({ where: { sellerId, payoutStatus: "BLOCKED" }, data: { payoutStatus: "HELD" } });
  await audit(adminId, "payouts.halt_cleared", "Seller", sellerId, { note });
}
