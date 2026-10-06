"use server";

import { z } from "zod";
import { clientIp, hit } from "@/lib/rate-limit";
import { requestContext } from "@/server/analytics";
import { cartItemSchema, priceCart, shipToSchema, startCheckout, CheckoutError } from "@/server/checkout";
import { currentUser } from "@/server/session";

const itemsSchema = z.array(cartItemSchema).max(50);

export interface PricedCartView {
  lines: Array<{
    listingId: string;
    variantId: string | null;
    slug: string;
    title: string;
    variantName: string | null;
    productType: string;
    image: { url: string; alt: string; kind: string; mockup: unknown } | null;
    shopName: string;
    aiTool: string;
    kind: string;
    unitPriceCents: number;
    quantity: number;
    lineCents: number;
    maxQuantity: number | null;
  }>;
  sellers: Array<{ shopName: string; shippingCents: number; minDays: number; maxDays: number }>;
  itemsCents: number;
  shippingCents: number;
  totalCents: number;
  hasPhysical: boolean;
  shippingEstimated: boolean;
  unavailable: Array<{ listingId: string; reason: string }>;
}

export async function priceCartAction(rawItems: unknown, rawShipTo?: unknown): Promise<PricedCartView | { error: string }> {
  const items = itemsSchema.safeParse(rawItems);
  if (!items.success) return { error: "Your cart could not be read." };
  const shipTo = rawShipTo ? shipToSchema.safeParse(rawShipTo) : null;
  if (shipTo && !shipTo.success) return { error: shipTo.error.issues[0]?.message ?? "Check the address." };
  try {
    const priced = await priceCart(items.data, shipTo?.success ? shipTo.data : null);
    return {
      lines: priced.sellers.flatMap((s) =>
        s.fulfillments.flatMap((f) =>
          f.lines.map((l) => ({
            listingId: l.listing.id,
            variantId: l.variant?.id ?? null,
            slug: l.listing.slug,
            title: l.listing.title,
            variantName: l.listing.variants.length > 1 ? l.variant?.name ?? null : null,
            productType: l.listing.productType,
            image: l.listing.images[0] ? { url: l.listing.images[0].url, alt: l.listing.images[0].alt, kind: l.listing.images[0].kind, mockup: l.listing.images[0].mockup } : null,
            shopName: s.seller.shopName,
            aiTool: l.listing.aiTool,
            kind: l.listing.kind,
            unitPriceCents: l.unitPriceCents,
            quantity: l.quantity,
            lineCents: l.lineCents,
            maxQuantity: l.listing.kind === "SELF_SHIP" ? l.listing.inventory : null,
          })),
        ),
      ),
      sellers: priced.sellers.map((s) => ({
        shopName: s.seller.shopName,
        shippingCents: s.shippingCents,
        minDays: Math.min(...s.fulfillments.map((f) => f.quote.minDays)),
        maxDays: Math.max(...s.fulfillments.map((f) => f.quote.maxDays)),
      })),
      itemsCents: priced.itemsCents,
      shippingCents: priced.shippingCents,
      totalCents: priced.totalCents,
      hasPhysical: priced.hasPhysical,
      shippingEstimated: priced.shippingEstimated,
      unavailable: priced.unavailable,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not price your cart." };
  }
}

export async function startCheckoutAction(input: { items: unknown; shipTo: unknown; email: string; checkoutKey?: string }): Promise<{ url: string } | { error: string }> {
  if (!(await hit("checkout", await clientIp()))) return { error: "Too many checkout attempts. Wait a few minutes." };
  const items = itemsSchema.safeParse(input.items);
  if (!items.success || items.data.length === 0) return { error: "Your cart is empty." };
  const email = z.string().email().safeParse(String(input.email ?? "").trim());
  if (!email.success) return { error: "Enter a valid email for your receipt." };
  let shipTo = null;
  if (input.shipTo) {
    const parsed = shipToSchema.safeParse(input.shipTo);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the shipping address." };
    shipTo = { ...parsed.data, email: email.data };
  }
  const user = await currentUser();
  const checkoutKey = typeof input.checkoutKey === "string" && /^[A-Za-z0-9-]{8,64}$/.test(input.checkoutKey) ? input.checkoutKey : null;
  try {
    const { url } = await startCheckout({ items: items.data, shipTo, email: email.data, buyerId: user?.id ?? null, checkoutKey, analytics: await requestContext(user) });
    return { url };
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    if (process.env.APP_MODE !== "live" && e instanceof Error && /valid head office address/i.test(e.message)) return { error: "Stripe Tax needs a head office address in your Stripe sandbox settings before test payments can start." };
    console.error("checkout failed", e);
    return { error: "We could not start checkout. Please try again." };
  }
}
