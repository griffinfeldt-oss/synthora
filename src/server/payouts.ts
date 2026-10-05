/**
 * Releasing held money to sellers. Runs from the cron route (daily on Vercel),
 * and admins can run it on demand.
 */
import "server-only";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { payments } from "@/lib/payments";
import { writeLedger } from "./ledger";
import { notifySeller } from "./notify";
import { refreshOrderStatus } from "./orders";

export interface PayoutRunResult {
  paid: number;
  blocked: number;
  failed: number;
  totalCents: number;
}

export async function releaseDuePayouts(now = new Date()): Promise<PayoutRunResult> {
  const due = await db.sellerOrder.findMany({
    where: {
      payoutStatus: { in: ["HELD", "ELIGIBLE", "BLOCKED"] },
      payoutEligibleAt: { lte: now },
      order: { paidAt: { not: null }, disputes: { none: { status: "OPEN" } } },
    },
    include: { seller: true, order: true },
    take: 200,
  });

  const result: PayoutRunResult = { paid: 0, blocked: 0, failed: 0, totalCents: 0 };
  for (const so of due) {
    const outcome = await payOutSellerOrder(so.id);
    if (outcome === "paid") {
      result.paid++;
      result.totalCents += so.netCents;
    } else if (outcome === "blocked") result.blocked++;
    else if (outcome === "failed") result.failed++;
  }
  return result;
}

export async function payOutSellerOrder(sellerOrderId: string): Promise<"paid" | "blocked" | "failed" | "skipped"> {
  const so = await db.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: { seller: true, order: true, payouts: true },
  });
  if (!so || so.payoutStatus === "PAID" || so.payoutStatus === "REVERSED" || so.payoutStatus === "CANCELED") return "skipped";

  const seller = so.seller;
  if (seller.status === "SUSPENDED" || !seller.stripeAccountId || !seller.payoutsEnabled) {
    if (so.payoutStatus !== "BLOCKED") {
      await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "BLOCKED" } });
      await notifySeller(seller.id, {
        type: "payout_blocked",
        title: "A payout is waiting for you",
        body:
          seller.status === "SUSPENDED"
            ? "Payouts are on hold while your shop is suspended."
            : "Finish Stripe onboarding so we can send your earnings.",
        href: "/seller/payouts",
      });
    }
    return "blocked";
  }

  const amount = so.netCents;
  if (amount <= 0) {
    await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "CANCELED" } });
    return "skipped";
  }

  // Claim before calling Stripe so two runs cannot both pay.
  const claim = await db.sellerOrder.updateMany({
    where: { id: so.id, payoutStatus: { in: ["HELD", "ELIGIBLE", "BLOCKED"] } },
    data: { payoutStatus: "PAID" },
  });
  if (claim.count === 0) return "skipped";

  try {
    const { transferId } = await payments().createTransfer({
      amountCents: amount,
      destinationAccountId: seller.stripeAccountId,
      transferGroup: so.orderId,
      sourceChargeId: so.order.stripeChargeId,
      idempotencyKey: `payout-${so.id}`,
      metadata: { sellerOrderId: so.id, orderId: so.orderId, orderNumber: so.order.number },
    });
    await db.$transaction(async (tx) => {
      await tx.payout.create({
        data: { sellerId: seller.id, sellerOrderId: so.id, amountCents: amount, stripeTransferId: transferId, status: "PAID" },
      });
      await tx.sellerOrder.update({
        where: { id: so.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await writeLedger(tx, [
        { type: "PAYOUT", account: "SELLER", amountCents: -amount, sellerId: seller.id, orderId: so.orderId, sellerOrderId: so.id, stripeRef: transferId, memo: "Transfer to seller" },
        { type: "PAYOUT", account: "CASH", amountCents: -amount, sellerId: seller.id, orderId: so.orderId, sellerOrderId: so.id, stripeRef: transferId, memo: "Transfer to seller" },
      ]);
    });
    await notifySeller(seller.id, {
      type: "payout_sent",
      title: `Payout sent: ${formatMoney(amount)}`,
      body: `We sent ${formatMoney(amount)} for order ${so.order.number} to your Stripe account.`,
      href: "/seller/payouts",
    });
    await refreshOrderStatus(so.orderId);
    return "paid";
  } catch (e) {
    await db.sellerOrder.update({ where: { id: so.id }, data: { payoutStatus: "ELIGIBLE" } });
    await db.payout.create({
      data: {
        sellerId: seller.id,
        sellerOrderId: so.id,
        amountCents: amount,
        status: "FAILED",
        failureReason: e instanceof Error ? e.message.slice(0, 500) : "Transfer failed",
      },
    });
    return "failed";
  }
}

/** Seller-facing balance summary. */
export async function sellerBalances(sellerId: string) {
  const [held, eligible, paid, refunds] = await Promise.all([
    db.sellerOrder.aggregate({ where: { sellerId, payoutStatus: { in: ["HELD", "BLOCKED"] } }, _sum: { netCents: true } }),
    db.sellerOrder.aggregate({ where: { sellerId, payoutStatus: "ELIGIBLE" }, _sum: { netCents: true } }),
    db.payout.aggregate({ where: { sellerId, status: "PAID" }, _sum: { amountCents: true, reversedCents: true } }),
    db.sellerOrder.aggregate({ where: { sellerId }, _sum: { refundedCents: true } }),
  ]);
  return {
    heldCents: held._sum.netCents ?? 0,
    eligibleCents: eligible._sum.netCents ?? 0,
    paidCents: (paid._sum.amountCents ?? 0) - (paid._sum.reversedCents ?? 0),
    refundedCents: refunds._sum.refundedCents ?? 0,
  };
}
