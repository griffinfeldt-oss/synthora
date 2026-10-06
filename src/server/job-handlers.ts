/**
 * Handlers for durable jobs (see src/server/jobs.ts). Each must be safe to run
 * more than once: a job can be retried after a crash at any point.
 */
import "server-only";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { registerJob } from "./jobs";
import { notifyBuyer, notifySeller } from "./notify";
import { reconcileOrderFee } from "./orders";
import { submitFulfillment } from "./fulfillment";
import { track } from "./analytics";

registerJob("order.notify_paid", async ({ orderId }) => {
  const order = await db.order.findUnique({
    where: { id: String(orderId) },
    include: { sellerOrders: { include: { items: true } }, items: { include: { entitlement: true } } },
  });
  if (!order) return;
  // At-least-once: a retry after a crash mid-way may repeat a message, never lose one.
  const sent = await db.notification.findMany({ where: { type: { in: ["order_paid", "new_order"] }, body: { contains: order.number } }, select: { userId: true, type: true } });
  const already = (type: string, userId: string | null) => sent.some((n) => n.type === type && n.userId === userId);
  if (!order.buyerId || !already("order_paid", order.buyerId)) {
    const files = order.items.filter((i) => i.entitlement).length;
    await notifyBuyer(order, {
      type: "order_paid",
      title: `Order ${order.number} confirmed`,
      body: `Thanks! We received ${formatMoney(order.totalCents)} for order ${order.number}.${files ? ` Your ${files === 1 ? "file is" : "files are"} ready to download on your order page.` : " You can follow every item on your order page."}`,
    });
  }
  for (const so of order.sellerOrders) {
    const seller = await db.seller.findUnique({ where: { id: so.sellerId }, select: { userId: true } });
    if (seller && already("new_order", seller.userId)) continue;
    await notifySeller(so.sellerId, {
      type: "new_order",
      title: `New order ${order.number}`,
      body: `You sold ${so.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")} (order ${order.number}).`,
      href: `/seller/orders/${so.id}`,
    });
  }
  for (const item of order.items) {
    if (item.entitlement) await track({ name: "entitlement_issued", orderId: order.id, listingId: item.listingId, listingVersionId: item.listingVersionId, dedupeKey: `entitlement_issued:${item.id}`, isTest: order.mode !== "live" });
  }
});

registerJob("fulfillment.dispatch", async ({ fulfillmentId }) => {
  const res = await submitFulfillment(String(fulfillmentId));
  // A definite refusal is handled (the seller is asked to act); an unknown outcome retries.
  if (res.outcome === "unknown") throw new Error(res.error ?? "The partner did not confirm the order yet.");
});

registerJob("fee.reconcile", async ({ orderId }) => {
  await reconcileOrderFee(String(orderId));
});
