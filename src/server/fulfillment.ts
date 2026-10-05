/**
 * Sending paid orders to each listing's partner and tracking them to the door.
 */
import "server-only";
import type { FulfillmentStatus as DbFulfillmentStatus, Prisma, SellerOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { absoluteUrl } from "@/lib/storage";
import { payoutReleaseDate } from "@/lib/fees";
import { contextFor, findProvider, getProvider } from "@/fulfillment/registry";
import type { FulfillmentStatus, PartnerUpdate, ShipTo, Tracking } from "@/fulfillment/types";
import { notifyBuyer, notifySeller } from "./notify";
import { refreshOrderStatus } from "./orders";

const RANK: Record<FulfillmentStatus, number> = {
  PENDING: 0,
  SUBMITTED: 1,
  IN_PRODUCTION: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  FAILED: 5,
  CANCELED: 6,
};

const fulfillmentInclude = {
  items: { include: { listing: { include: { images: true } }, variant: true } },
  sellerOrder: { include: { order: true, seller: true } },
} satisfies Prisma.FulfillmentInclude;

export async function dispatchFulfillments(orderId: string): Promise<void> {
  const pending = await db.fulfillment.findMany({
    where: { sellerOrder: { orderId }, status: "PENDING", partnerOrderId: null },
    select: { id: true },
  });
  for (const f of pending) await submitFulfillment(f.id);
}

function designUrlFor(listing: { partnerData: Prisma.JsonValue; images: Array<{ kind: string; url: string }> }): string | null {
  const data = (listing.partnerData ?? {}) as { designUrl?: string };
  const url = data.designUrl ?? listing.images.find((i) => i.kind === "DESIGN")?.url ?? listing.images[0]?.url;
  return url ? absoluteUrl(url) : null;
}

/** Create the partner order for one fulfillment. Safe to retry. */
export async function submitFulfillment(fulfillmentId: string): Promise<{ ok: boolean; error?: string }> {
  const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId }, include: fulfillmentInclude });
  if (!f) return { ok: false, error: "Not found" };
  if (f.partnerOrderId && f.status !== "FAILED") return { ok: true };

  const adapter = getProvider(f.provider);
  const connection = f.connectionId ? await db.partnerConnection.findUnique({ where: { id: f.connectionId } }) : null;
  const order = f.sellerOrder.order;
  const shipTo = (order.shippingAddress ?? null) as ShipTo | null;

  try {
    if (adapter.kind === "pod" && !connection) throw new Error(`The seller's ${adapter.name} account is not connected.`);
    const result = await adapter.createOrder(contextFor(connection), {
      externalId: f.id,
      shipTo: shipTo ? { ...shipTo, email: shipTo.email ?? order.email } : null,
      items: f.items.map((i) => ({
        partnerProductId: i.listing.partnerProductId,
        partnerVariantId: i.variant?.partnerVariantId ?? null,
        quantity: i.quantity,
        designUrl: designUrlFor(i.listing),
        partnerData: (i.listing.partnerData ?? null) as Record<string, unknown> | null,
        title: i.title,
      })),
    });
    const now = new Date();
    await db.fulfillment.update({
      where: { id: f.id },
      data: {
        partnerOrderId: result.partnerOrderId,
        status: result.status,
        attempts: { increment: 1 },
        failureReason: null,
        deliveredAt: result.status === "DELIVERED" ? now : undefined,
        raw: (result.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    if (adapter.kind === "self") {
      await notifySeller(f.sellerOrder.sellerId, {
        type: "ship_order",
        title: `Ship order ${order.number}`,
        body: `This order ships from you. Pack it within the processing time and add the tracking number.`,
        href: `/seller/orders/${f.sellerOrderId}`,
      });
    }
    await refreshSellerOrder(f.sellerOrderId);
    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await markFulfillmentFailed(f.id, reason, { incrementAttempts: true });
    return { ok: false, error: reason };
  }
}

async function markFulfillmentFailed(fulfillmentId: string, reason: string, opts: { incrementAttempts?: boolean } = {}) {
  const f = await db.fulfillment.update({
    where: { id: fulfillmentId },
    data: { status: "FAILED", failureReason: reason.slice(0, 500), attempts: opts.incrementAttempts ? { increment: 1 } : undefined },
    include: { sellerOrder: { include: { order: true } } },
  });
  const provider = findProvider(f.provider);
  await notifySeller(f.sellerOrder.sellerId, {
    type: "fulfillment_failed",
    title: `Action needed: order ${f.sellerOrder.order.number}`,
    body: `${provider?.name ?? f.provider} could not take this order: ${reason}. Fix the issue and retry, or refund the buyer.`,
    href: `/seller/orders/${f.sellerOrderId}`,
  });
  await notifyBuyer(f.sellerOrder.order, {
    type: "fulfillment_delayed",
    title: `A delay with order ${f.sellerOrder.order.number}`,
    body: "Part of your order hit a production problem. The seller has been told and will fix it or refund you. You have not been charged anything extra.",
  });
  await refreshSellerOrder(f.sellerOrderId);
}

/** Apply a normalised partner update (from a webhook, a status poll, or the seller). */
export async function applyFulfillmentUpdate(
  where: { id: string } | { provider: string; partnerOrderId: string },
  update: { status?: FulfillmentStatus; tracking?: Tracking; failureReason?: string | null; occurredAt?: Date },
): Promise<boolean> {
  const f =
    "id" in where
      ? await db.fulfillment.findUnique({ where: { id: where.id }, include: { sellerOrder: { include: { order: true } } } })
      : await db.fulfillment.findUnique({
          where: { provider_partnerOrderId: { provider: where.provider, partnerOrderId: where.partnerOrderId } },
          include: { sellerOrder: { include: { order: true } } },
        });
  if (!f) return false;

  if (update.status === "FAILED") {
    await markFulfillmentFailed(f.id, update.failureReason ?? "The partner reported a problem");
    return true;
  }

  const current = f.status as FulfillmentStatus;
  const next = update.status && (RANK[update.status] > RANK[current] || current === "FAILED") ? update.status : current;
  const at = update.occurredAt ?? new Date();
  const data: Prisma.FulfillmentUpdateInput = { status: next as DbFulfillmentStatus };
  if (update.tracking?.number) {
    data.trackingNumber = update.tracking.number;
    data.trackingCarrier = update.tracking.carrier ?? null;
    data.trackingUrl = update.tracking.url ?? null;
  }
  if ((next === "SHIPPED" || next === "DELIVERED") && !f.shippedAt) data.shippedAt = at;
  if (next === "DELIVERED" && !f.deliveredAt) data.deliveredAt = at;
  await db.fulfillment.update({ where: { id: f.id }, data });

  if (next !== current) {
    const order = f.sellerOrder.order;
    if (next === "SHIPPED") {
      const t = update.tracking;
      await notifyBuyer(order, {
        type: "shipped",
        title: `Shipped: part of order ${order.number}`,
        body: t?.number ? `On its way with ${t.carrier ?? "the carrier"}, tracking ${t.number}.` : "Your item is on its way.",
      });
    } else if (next === "DELIVERED") {
      await notifyBuyer(order, {
        type: "delivered",
        title: `Delivered: part of order ${order.number}`,
        body: "Tracking shows your item was delivered. Everything OK? Confirm on your order page, or tell us if something is wrong. You can also leave a review.",
      });
    }
  }
  await refreshSellerOrder(f.sellerOrderId);
  return true;
}

/** Handle a batch of webhook updates for one provider. */
export async function applyPartnerUpdates(provider: string, updates: PartnerUpdate[]): Promise<number> {
  let applied = 0;
  for (const u of updates) {
    const claimed = await db.webhookEvent.createMany({
      data: [{ id: `${provider}:${u.eventId}`, source: provider, type: u.status ?? "update" }],
      skipDuplicates: true,
    });
    if (claimed.count === 0) continue; // duplicate delivery
    if (await applyFulfillmentUpdate({ provider, partnerOrderId: u.partnerOrderId }, u)) applied++;
  }
  return applied;
}

/** Roll fulfillment states up to the seller order and set the payout release date. */
export async function refreshSellerOrder(sellerOrderId: string): Promise<void> {
  const so = await db.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: { fulfillments: true, order: { include: { disputes: true } }, items: true },
  });
  if (!so || so.status === "PENDING" || so.status === "CANCELED" || so.status === "REFUNDED") return;

  const fs = so.fulfillments.filter((f) => f.status !== "CANCELED");
  const st = fs.map((f) => f.status);
  let status: SellerOrderStatus = so.status;
  if (so.status !== "COMPLETED") {
    if (st.length === 0) status = "CANCELED";
    else if (st.includes("FAILED")) status = "ACTION_NEEDED";
    else if (st.every((s) => s === "DELIVERED")) status = "DELIVERED";
    else if (st.every((s) => s === "SHIPPED" || s === "DELIVERED")) status = "SHIPPED";
    else if (st.some((s) => s === "IN_PRODUCTION" || s === "SHIPPED" || s === "DELIVERED")) status = "IN_PRODUCTION";
    else status = "PAID";
  }

  const allDigital = so.items.every((i) => i.provider === "digital");
  const shippedTimes = fs.map((f) => f.shippedAt?.getTime() ?? 0);
  const deliveredTimes = fs.map((f) => f.deliveredAt?.getTime() ?? 0);
  const releaseAt = payoutReleaseDate({
    kind: allDigital ? "digital" : "physical",
    paidAt: so.order.paidAt,
    shippedAt: shippedTimes.every((t) => t > 0) ? new Date(Math.max(...shippedTimes)) : null,
    deliveredAt: deliveredTimes.every((t) => t > 0) ? new Date(Math.max(...deliveredTimes)) : null,
    buyerConfirmedAt: so.buyerConfirmedAt,
    disputeOpen: so.order.disputes.some((d) => d.status === "OPEN"),
  });

  const deliveredAt =
    status === "DELIVERED" && !so.deliveredAt ? new Date(Math.max(...deliveredTimes) || Date.now()) : so.deliveredAt;
  await db.sellerOrder.update({
    where: { id: so.id },
    data: {
      status,
      deliveredAt,
      payoutEligibleAt: releaseAt,
      payoutStatus: ["HELD", "ELIGIBLE", "NOT_READY"].includes(so.payoutStatus)
        ? releaseAt && releaseAt.getTime() <= Date.now()
          ? "ELIGIBLE"
          : "HELD"
        : so.payoutStatus,
    },
  });
  await refreshOrderStatus(so.orderId);
}

// ─── Seller and buyer actions ────────────────────────────────────────────────

export async function addSelfShipTracking(
  sellerId: string,
  fulfillmentId: string,
  tracking: { carrier: string; number: string; url?: string | null },
): Promise<void> {
  const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId }, include: { sellerOrder: true } });
  if (!f || f.sellerOrder.sellerId !== sellerId) throw new Error("Order not found");
  if (f.provider !== "self") throw new Error("Tracking for partner orders comes from the partner.");
  await applyFulfillmentUpdate({ id: f.id }, { status: "SHIPPED", tracking });
}

export async function retryFulfillment(sellerId: string, fulfillmentId: string) {
  const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId }, include: { sellerOrder: true } });
  if (!f || f.sellerOrder.sellerId !== sellerId) throw new Error("Order not found");
  if (f.status !== "FAILED" && f.partnerOrderId) throw new Error("This order is already with the partner.");
  await db.fulfillment.update({ where: { id: f.id }, data: { partnerOrderId: null, status: "PENDING" } });
  return submitFulfillment(f.id);
}

/** Buyer confirms everything from one seller arrived: releases that seller's payout. */
export async function confirmDelivery(orderId: string, sellerOrderId: string): Promise<void> {
  const so = await db.sellerOrder.findFirst({ where: { id: sellerOrderId, orderId }, include: { fulfillments: true } });
  if (!so) throw new Error("Order not found");
  if (!["SHIPPED", "DELIVERED", "IN_PRODUCTION", "PAID"].includes(so.status)) return;
  const now = new Date();
  await db.fulfillment.updateMany({
    where: { sellerOrderId, status: { in: ["SHIPPED", "SUBMITTED", "IN_PRODUCTION", "PENDING"] } },
    data: { status: "DELIVERED", deliveredAt: now },
  });
  await db.sellerOrder.update({ where: { id: sellerOrderId }, data: { buyerConfirmedAt: now } });
  await refreshSellerOrder(sellerOrderId);
}

/** Mock mode: push a fake partner webhook through the real webhook pipeline. */
export async function simulatePartnerEvent(fulfillmentId: string, status: FulfillmentStatus): Promise<void> {
  const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId } });
  if (!f?.partnerOrderId) throw new Error("This fulfillment has not been sent to a partner yet.");
  const adapter = getProvider(f.provider);
  const connection = f.connectionId ? await db.partnerConnection.findUnique({ where: { id: f.connectionId } }) : null;
  if (!(connection?.mock || mock.fulfillment) && adapter.kind === "pod") throw new Error("Simulation is only for demo connections.");
  if (adapter.buildMockWebhook) {
    const req = adapter.buildMockWebhook(f.partnerOrderId, status);
    const updates = await adapter.handleWebhook(req);
    await applyPartnerUpdates(adapter.id, updates);
  } else {
    await applyFulfillmentUpdate({ id: f.id }, { status, tracking: status === "SHIPPED" ? { carrier: "USPS", number: `9400${Date.now()}` } : undefined });
  }
}

/** Cron fallback for missed webhooks: poll partners for fulfillments in flight. */
export async function syncActiveFulfillments(limit = 50): Promise<number> {
  const active = await db.fulfillment.findMany({
    where: {
      status: { in: ["SUBMITTED", "IN_PRODUCTION", "SHIPPED"] },
      partnerOrderId: { not: null },
      provider: { notIn: ["self", "digital"] },
      updatedAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
    take: limit,
  });
  let changed = 0;
  for (const f of active) {
    const connection = f.connectionId ? await db.partnerConnection.findUnique({ where: { id: f.connectionId } }) : null;
    try {
      const s = await getProvider(f.provider).getStatus(contextFor(connection), f.partnerOrderId!);
      if (s.status !== f.status || s.tracking?.number) {
        await applyFulfillmentUpdate({ id: f.id }, { status: s.status, tracking: s.tracking, failureReason: s.failureReason });
        changed++;
      } else {
        await db.fulfillment.update({ where: { id: f.id }, data: { updatedAt: new Date() } });
      }
    } catch {
      // try again next run
    }
  }
  return changed;
}
