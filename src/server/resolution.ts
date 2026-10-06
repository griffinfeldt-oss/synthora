/**
 * Getting uncertain operations to a final answer.
 *
 * `recoverOperations` runs from cron: it re-asks the provider about UNKNOWN or
 * abandoned operations and finishes the bookkeeping for any that turn out to have
 * happened. `resolveByHand` is the admin action queue's "I checked in Stripe".
 */
import "server-only";
import { db } from "@/lib/db";
import { payments } from "@/lib/payments";
import { contextFor, getProvider } from "@/fulfillment/registry";
import { audit } from "./notify";
import { markOrderPaid } from "./orders";
import { resolveOperation, runOperation } from "./operations";
import { payOutSellerOrder } from "./payouts";
import { settleRefundOperation, settleReversalOperation } from "./refunds";
import { applyFulfillmentUpdate, submitFulfillment } from "./fulfillment";

async function settle(opId: string): Promise<void> {
  const op = await db.operation.findUniqueOrThrow({ where: { id: opId } });
  switch (op.kind) {
    case "refund":
      await settleRefundOperation(op.id);
      break;
    case "reversal":
      await settleReversalOperation(op.id);
      break;
    case "transfer":
      if (op.sellerOrderId) {
        if (op.status === "FAILED") {
          await db.sellerOrder.updateMany({ where: { id: op.sellerOrderId, payoutStatus: "PROCESSING" }, data: { payoutStatus: "ELIGIBLE" } });
        } else {
          await payOutSellerOrder(op.sellerOrderId);
        }
      }
      break;
    case "partner_order": {
      const fulfillmentId = (op.payload as { fulfillmentId?: string }).fulfillmentId;
      if (!fulfillmentId) break;
      if (op.status === "CONFIRMED" && op.providerRef) {
        await db.fulfillment.updateMany({ where: { id: fulfillmentId, partnerOrderId: null }, data: { partnerOrderId: op.providerRef, status: "SUBMITTED" } });
        await applyFulfillmentUpdate({ id: fulfillmentId }, {});
      } else if (op.status === "FAILED") {
        await applyFulfillmentUpdate({ id: fulfillmentId }, { status: "FAILED", failureReason: op.resolutionNote ?? op.lastError ?? "The partner did not take this order" });
      }
      break;
    }
    case "payment_check": {
      const p = op.payload as { orderId: string; paymentIntentId: string };
      // CONFIRMED here means a person checked the payment really covers the order.
      if (op.status === "CONFIRMED") await markOrderPaid({ orderId: p.orderId, paymentIntentId: p.paymentIntentId });
      break;
    }
  }
}

/** Cron: retry recovery for uncertain operations. */
export async function recoverOperations(limit = 25): Promise<{ checked: number; settled: number }> {
  const stale = await db.operation.findMany({
    where: {
      OR: [{ status: "UNKNOWN" }, { status: "PROCESSING", leaseUntil: { lt: new Date() } }],
      kind: { in: ["refund", "reversal", "partner_order"] },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  let settled = 0;
  for (const op of stale) {
    try {
      const after = await recheck(op.id);
      if (after === "CONFIRMED" || after === "FAILED") {
        await settle(op.id);
        settled++;
      }
    } catch (e) {
      await db.operation.update({ where: { id: op.id }, data: { lastError: `Recovery: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` } });
    }
  }
  return { checked: stale.length, settled };
}

/** Ask the provider again about one operation, using the same key and terms. */
async function recheck(opId: string): Promise<string> {
  const op = await db.operation.findUniqueOrThrow({ where: { id: opId } });
  const payload = op.payload as Record<string, unknown>;
  const gw = payments();
  if (op.kind === "refund") {
    const p = payload as { paymentIntentId: string; amountCents: number };
    const res = await runOperation({
      key: op.key,
      kind: op.kind,
      payload,
      replayWindowMs: 24 * 3_600_000,
      execute: async (idempotencyKey) => ({ ref: (await gw.refund({ paymentIntentId: p.paymentIntentId, amountCents: p.amountCents, idempotencyKey, metadata: { opKey: op.key } })).refundId }),
      lookup: async () => {
        const r = await gw.findRefund({ paymentIntentId: p.paymentIntentId, opKey: op.key });
        return r ? { ref: r.refundId } : null;
      },
    });
    return res.status;
  }
  if (op.kind === "reversal") {
    const p = payload as { transferId: string; amountCents: number };
    const res = await runOperation({
      key: op.key,
      kind: op.kind,
      payload,
      replayWindowMs: 24 * 3_600_000,
      execute: async (idempotencyKey) => ({ ref: (await gw.reverseTransfer({ transferId: p.transferId, amountCents: p.amountCents, idempotencyKey, metadata: { opKey: op.key } })).reversalId }),
      lookup: async () => {
        const r = await gw.findReversal({ transferId: p.transferId, opKey: op.key });
        return r ? { ref: r.reversalId } : null;
      },
    });
    return res.status;
  }
  if (op.kind === "partner_order") {
    const fulfillmentId = String(payload.fulfillmentId);
    const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId } });
    if (!f) return op.status;
    const adapter = getProvider(f.provider);
    if (!adapter.findOrder) return op.status;
    const connection = f.connectionId ? await db.partnerConnection.findUnique({ where: { id: f.connectionId } }) : null;
    const found = await adapter.findOrder(contextFor(connection), f.id);
    if (found) {
      await db.operation.update({ where: { id: op.id }, data: { status: "CONFIRMED", providerRef: found.partnerOrderId, leaseUntil: null, escalateAt: null } });
      return "CONFIRMED";
    }
    // Definitely not there: a fresh attempt is safe.
    if (op.status === "UNKNOWN" || op.status === "PROCESSING") {
      await db.operation.update({ where: { id: op.id }, data: { status: "FAILED", lastError: "Not found at the partner; retrying", leaseUntil: null } });
      await db.fulfillment.update({ where: { id: f.id }, data: { attempts: { increment: 1 } } });
      await submitFulfillment(f.id);
      return "RETRIED";
    }
  }
  return op.status;
}

/** Admin: record what really happened, then finish the bookkeeping. */
export async function resolveByHand(input: { opId: string; actorId: string; outcome: "CONFIRMED" | "FAILED"; providerRef?: string | null; note: string }) {
  const op = await resolveOperation({ id: input.opId, actorId: input.actorId, outcome: input.outcome, providerRef: input.providerRef, note: input.note });
  await audit(input.actorId, `operation.resolved_${input.outcome.toLowerCase()}`, "Operation", op.id, { key: op.key, providerRef: input.providerRef, note: input.note });
  await settle(op.id);
}
