/**
 * Sending paid orders to each listing's partner and tracking them to the door.
 */
import "server-only";
import type { FulfillmentStatus as DbFulfillmentStatus, Prisma, SellerOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { env, isLive, mock } from "@/lib/env";
import { payoutReleaseDate } from "@/lib/fees";
import { contextFor, findProvider, getProvider } from "@/fulfillment/registry";
import { PartnerApiError, type FulfillmentStatus, type PartnerUpdate, type ShipTo, type Tracking } from "@/fulfillment/types";
import { signedOriginalUrl } from "./assets";
import { notifyBuyer, notifySeller } from "./notify";
import { refreshOrderStatus } from "./orders";
import { runOperation } from "./operations";

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

/** Partners fetch print files themselves; S3 signed links last at most 7 days. */
const PRINT_FILE_LINK_SECONDS = 7 * 24 * 3600;

async function printFileUrl(item: { designAssetId: string | null; partnerSpec: Prisma.JsonValue }): Promise<string | null> {
  if (item.designAssetId) {
    const asset = await db.asset.findUnique({ where: { id: item.designAssetId } });
    if (asset) return signedOriginalUrl(asset, PRINT_FILE_LINK_SECONDS);
  }
  // Orders placed before files were stored privately carried a public design URL.
  const legacy = (item.partnerSpec as { designUrl?: string } | null)?.designUrl;
  return legacy ? (legacy.startsWith("http") ? legacy : `${env.appUrl}${legacy}`) : null;
}

function partnerClassify(e: unknown): "FAILED" | "UNKNOWN" {
  if (e instanceof PartnerApiError) return e.status >= 500 || e.status === 429 ? "UNKNOWN" : "FAILED";
  if (e instanceof TypeError || (e as { name?: string })?.name === "TimeoutError") return "UNKNOWN";
  return "FAILED";
}

export type SubmitOutcome = { outcome: "submitted" | "failed" | "unknown" | "skipped"; error?: string };

/**
 * Create the partner order for one fulfillment, exactly once. Uses what was frozen
 * at checkout (product, variant, design file and its hash), not the live listing.
 */
export async function submitFulfillment(fulfillmentId: string): Promise<SubmitOutcome> {
  const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId }, include: fulfillmentInclude });
  if (!f) return { outcome: "skipped", error: "Not found" };
  if (f.partnerOrderId && f.status !== "FAILED") return { outcome: "submitted" };
  if (f.status === "CANCELED") return { outcome: "skipped" };

  const adapter = getProvider(f.provider);
  const connection = f.connectionId ? await db.partnerConnection.findUnique({ where: { id: f.connectionId } }) : null;
  const order = f.sellerOrder.order;
  const shipTo = (order.shippingAddress ?? null) as ShipTo | null;

  if (adapter.kind === "pod" && !connection) {
    await markFulfillmentFailed(f.id, `The seller's ${adapter.name} account is not connected.`, { incrementAttempts: true });
    return { outcome: "failed", error: "Partner not connected" };
  }
  if (connection?.mock && isLive()) {
    await markFulfillmentFailed(f.id, `This order was routed to a demo ${adapter.name} connection, which cannot make real products.`, { incrementAttempts: true });
    return { outcome: "failed", error: "Demo connection in live mode" };
  }

  const ctx = contextFor(connection);
  const items = await Promise.all(
    f.items.map(async (i) => ({
      partnerProductId: i.partnerProductId ?? i.listing.partnerProductId,
      partnerVariantId: i.partnerVariantId ?? i.variant?.partnerVariantId ?? null,
      quantity: i.quantity,
      designUrl: adapter.kind === "pod" ? await printFileUrl(i) : null,
      partnerData: (i.partnerSpec ?? i.listing.partnerData ?? null) as Record<string, unknown> | null,
      title: i.title,
    })),
  );
  // A retry after a failure is a new attempt with its own key; a crash mid-call recovers the same one.
  const key = `partner-order:${f.id}:${f.attempts}`;
  const op = await runOperation({
    key,
    kind: "partner_order",
    payload: { fulfillmentId: f.id, provider: f.provider, items: f.items.map((i) => ({ id: i.id, sha: i.designSha256, q: i.quantity })) },
    sellerId: f.sellerOrder.sellerId,
    orderId: order.id,
    sellerOrderId: f.sellerOrderId,
    ownerRole: "operations",
    execute: async () => {
      const result = await adapter.createOrder(ctx, {
        externalId: f.id,
        shipTo: shipTo ? { ...shipTo, email: shipTo.email ?? order.email } : null,
        items,
      });
      return { ref: result.partnerOrderId, result: { status: result.status } };
    },
    lookup: adapter.findOrder
      ? async () => {
          const found = await adapter.findOrder!(ctx, f.id);
          return found ? { ref: found.partnerOrderId, result: { status: found.status } } : null;
        }
      : undefined,
    classify: partnerClassify,
  });

  if (op.status === "CONFIRMED") {
    const status = ((op.result as { status?: FulfillmentStatus } | null)?.status ?? "SUBMITTED") as DbFulfillmentStatus;
    await db.fulfillment.update({
      where: { id: f.id },
      data: {
        partnerOrderId: op.providerRef,
        status,
        attempts: { increment: 1 },
        failureReason: null,
        deliveredAt: status === "DELIVERED" ? new Date() : undefined,
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
    return { outcome: "submitted" };
  }
  if (op.status === "FAILED") {
    await markFulfillmentFailed(f.id, op.lastError ?? "The partner refused the order", { incrementAttempts: true });
    return { outcome: "failed", error: op.lastError ?? undefined };
  }
  // UNKNOWN or still PROCESSING elsewhere: the job retries and recovery looks the order up.
  return { outcome: "unknown", error: op.lastError ?? "Waiting for the partner to confirm." };
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
  const open = await db.operation.count({ where: { key: { startsWith: `partner-order:${f.id}:` }, status: { in: ["PROCESSING", "UNKNOWN"] } } });
  if (open) throw new Error("A previous attempt has not been confirmed yet. Synthora is checking with the partner.");
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
