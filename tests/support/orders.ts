import { db } from "@/lib/db";
import { startCheckout, type CartItem } from "@/server/checkout";
import { markOrderPaid } from "@/server/orders";

export const SHIP = { name: "Ada Lovelace", line1: "1 Analytical Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" };

/** Checkout and a verified payment for exactly the order total. */
export async function paidOrder(items: CartItem[], opts: { shipTo?: typeof SHIP | null; email?: string; buyerId?: string | null; feeCents?: number | null } = {}) {
  const { orderId } = await startCheckout({ items, shipTo: opts.shipTo === undefined ? SHIP : opts.shipTo, email: opts.email ?? "buyer@test.local", buyerId: opts.buyerId ?? null });
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await markOrderPaid({ orderId, paymentIntentId: `pi_${orderId}`, chargeId: `ch_${orderId}`, feeCents: opts.feeCents === undefined ? 100 : opts.feeCents, amountCents: order.totalCents, currency: "usd" });
  return orderId;
}

export async function sellerBalance(sellerOrderId: string): Promise<number> {
  return (await db.ledgerEntry.aggregate({ where: { sellerOrderId, account: "SELLER" }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
}
