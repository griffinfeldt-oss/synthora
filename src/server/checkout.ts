/**
 * Cart → priced order → Stripe Checkout.
 *
 * A cart can hold items from many sellers, each using a different fulfillment
 * partner. Items are grouped by seller (one SellerOrder each, for payouts) and
 * then by partner connection (one Fulfillment each, i.e. one partner order).
 * Shipping is quoted per fulfillment through that partner's adapter.
 */
import "server-only";
import { z } from "zod";
import type { Listing, ListingImage, ListingVariant, PartnerConnection, Seller } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { splitOrder } from "@/lib/fees";
import { orderNumber } from "@/lib/utils";
import { payments } from "@/lib/payments";
import type { CheckoutLine } from "@/lib/payments/types";
import { contextFor, getProvider } from "@/fulfillment/registry";
import type { Quote, ShipTo } from "@/fulfillment/types";
import { publicListingWhere } from "./listings";

export const cartItemSchema = z.object({
  listingId: z.string().min(1),
  variantId: z.string().nullable().optional(),
  quantity: z.number().int().min(1).max(20),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const shipToSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's name").max(100),
  line1: z.string().trim().min(3, "Enter a street address").max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(2, "Enter a city").max(100),
  state: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().min(3, "Enter a postal code").max(20),
  country: z
    .string()
    .trim()
    .length(2, "Use a 2-letter country code")
    .transform((c) => c.toUpperCase()),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
});

type LoadedListing = Listing & {
  seller: Seller;
  images: ListingImage[];
  variants: ListingVariant[];
  partnerConnection: PartnerConnection | null;
};

export interface PricedLine {
  listing: LoadedListing;
  variant: ListingVariant | null;
  quantity: number;
  unitPriceCents: number;
  lineCents: number;
  baseCostCents: number;
}

export interface PricedFulfillment {
  provider: string;
  connectionId: string | null;
  lines: PricedLine[];
  quote: Quote;
}

export interface PricedSeller {
  seller: Seller;
  fulfillments: PricedFulfillment[];
  itemsCents: number;
  shippingCents: number;
  partnerCostCents: number;
  partnerShippingCents: number;
}

export interface PricedCart {
  sellers: PricedSeller[];
  itemsCents: number;
  shippingCents: number;
  totalCents: number;
  hasPhysical: boolean;
  unavailable: Array<{ listingId: string; reason: string }>;
  shippingEstimated: boolean;
}

export async function loadCartListings(items: CartItem[]): Promise<Map<string, LoadedListing>> {
  const ids = Array.from(new Set(items.map((i) => i.listingId)));
  const listings = await db.listing.findMany({
    where: { id: { in: ids }, ...publicListingWhere() },
    include: {
      seller: true,
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
      partnerConnection: true,
    },
  });
  return new Map(listings.map((l) => [l.id, l]));
}

/** Price a cart. Pass `shipTo` for real partner quotes; without it shipping is estimated. */
export async function priceCart(items: CartItem[], shipTo: ShipTo | null): Promise<PricedCart> {
  const listings = await loadCartListings(items);
  const unavailable: PricedCart["unavailable"] = [];
  const lines: PricedLine[] = [];

  for (const item of items) {
    const listing = listings.get(item.listingId);
    if (!listing) {
      unavailable.push({ listingId: item.listingId, reason: "No longer available" });
      continue;
    }
    const variant = item.variantId ? listing.variants.find((v) => v.id === item.variantId) ?? null : listing.variants[0] ?? null;
    if (listing.kind === "SELF_SHIP" && listing.inventory !== null && listing.inventory < item.quantity) {
      unavailable.push({ listingId: listing.id, reason: listing.inventory > 0 ? `Only ${listing.inventory} left` : "Sold out" });
      continue;
    }
    const quantity = listing.kind === "DIGITAL" ? 1 : item.quantity;
    const unitPriceCents = variant?.priceCents ?? listing.priceCents;
    lines.push({
      listing,
      variant,
      quantity,
      unitPriceCents,
      lineCents: unitPriceCents * quantity,
      baseCostCents: variant?.baseCostCents || listing.baseCostCents,
    });
  }

  // Group: seller → fulfillment (provider + connection)
  const bySeller = new Map<string, { seller: Seller; groups: Map<string, PricedLine[]> }>();
  for (const line of lines) {
    const s = bySeller.get(line.listing.sellerId) ?? { seller: line.listing.seller, groups: new Map() };
    const key = `${line.listing.provider}:${line.listing.partnerConnectionId ?? "-"}`;
    s.groups.set(key, [...(s.groups.get(key) ?? []), line]);
    bySeller.set(line.listing.sellerId, s);
  }

  const sellers: PricedSeller[] = [];
  for (const { seller, groups } of bySeller.values()) {
    const fulfillments: PricedFulfillment[] = [];
    for (const groupLines of groups.values()) {
      const first = groupLines[0].listing;
      const adapter = getProvider(first.provider);
      const quote = await adapter.getQuote(
        contextFor(first.partnerConnection),
        groupLines.map((l) => ({
          partnerProductId: l.listing.partnerProductId,
          partnerVariantId: l.variant?.partnerVariantId ?? null,
          quantity: l.quantity,
          baseCostCents: l.baseCostCents,
          partnerData: (l.listing.partnerData ?? null) as Record<string, unknown> | null,
          flatShippingCents: l.listing.shippingCents,
        })),
        shipTo,
      );
      fulfillments.push({ provider: first.provider, connectionId: first.partnerConnectionId, lines: groupLines, quote });
    }
    const itemsCents = fulfillments.flatMap((f) => f.lines).reduce((a, l) => a + l.lineCents, 0);
    const shippingCents = fulfillments.reduce((a, f) => a + f.quote.shippingCents, 0);
    const partnerShippingCents = fulfillments
      .filter((f) => getProvider(f.provider).kind === "pod")
      .reduce((a, f) => a + f.quote.shippingCents, 0);
    const partnerCostCents = fulfillments
      .filter((f) => getProvider(f.provider).kind === "pod")
      .flatMap((f) => f.lines)
      .reduce((a, l) => a + l.baseCostCents * l.quantity, 0);
    sellers.push({ seller, fulfillments, itemsCents, shippingCents, partnerCostCents, partnerShippingCents });
  }

  const itemsCents = sellers.reduce((a, s) => a + s.itemsCents, 0);
  const shippingCents = sellers.reduce((a, s) => a + s.shippingCents, 0);
  return {
    sellers,
    itemsCents,
    shippingCents,
    totalCents: itemsCents + shippingCents,
    hasPhysical: lines.some((l) => l.listing.kind !== "DIGITAL"),
    unavailable,
    shippingEstimated: !shipTo,
  };
}

export class CheckoutError extends Error {}

/**
 * Create the order (PENDING_PAYMENT) and a Stripe Checkout session for it.
 * Returns the URL to send the buyer to.
 */
export async function startCheckout(input: {
  items: CartItem[];
  shipTo: ShipTo | null;
  email: string;
  buyerId: string | null;
}): Promise<{ orderId: string; url: string }> {
  if (input.items.length === 0) throw new CheckoutError("Your cart is empty.");
  const priced = await priceCart(input.items, input.shipTo);
  if (priced.unavailable.length) {
    throw new CheckoutError("Some items in your cart are no longer available. Please review your cart.");
  }
  if (priced.hasPhysical && !input.shipTo) throw new CheckoutError("A shipping address is needed for physical items.");

  const split = splitOrder(
    priced.sellers.map((s) => ({
      sellerId: s.seller.id,
      itemsCents: s.itemsCents,
      shippingCents: s.shippingCents,
      partnerCostCents: s.partnerCostCents,
      partnerShippingCents: s.partnerShippingCents,
    })),
  );

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number: orderNumber(),
        buyerId: input.buyerId,
        email: input.email.toLowerCase(),
        shippingAddress: input.shipTo ? (input.shipTo as object) : undefined,
        subtotalCents: priced.itemsCents,
        shippingCents: priced.shippingCents,
        totalCents: priced.totalCents,
        accessToken: randomToken(18),
      },
    });
    for (const s of priced.sellers) {
      const share = split.sellers.find((x) => x.sellerId === s.seller.id)!;
      const sellerOrder = await tx.sellerOrder.create({
        data: {
          orderId: created.id,
          sellerId: s.seller.id,
          itemsCents: share.itemsCents,
          shippingCents: share.shippingCents,
          commissionCents: share.commissionCents,
          processingFeeCents: share.processingFeeCents,
          partnerCostCents: share.partnerCostCents,
          netCents: share.netCents,
        },
      });
      for (const f of s.fulfillments) {
        const fulfillment = await tx.fulfillment.create({
          data: { sellerOrderId: sellerOrder.id, provider: f.provider, connectionId: f.connectionId },
        });
        for (const l of f.lines) {
          await tx.orderItem.create({
            data: {
              orderId: created.id,
              sellerOrderId: sellerOrder.id,
              fulfillmentId: fulfillment.id,
              listingId: l.listing.id,
              variantId: l.variant?.id,
              title: l.listing.title,
              variantName: l.variant?.name,
              imageUrl: l.listing.images[0]?.url ?? null,
              provider: l.listing.provider,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              baseCostCents: l.baseCostCents,
            },
          });
        }
      }
    }
    return created;
  });

  const lines: CheckoutLine[] = priced.sellers.flatMap((s) =>
    s.fulfillments.flatMap((f) =>
      f.lines.map((l) => ({
        name: l.variant && l.listing.variants.length > 1 ? `${l.listing.title} (${l.variant.name})` : l.listing.title,
        description: `Sold by ${s.seller.shopName} · Made with ${l.listing.aiTool}`,
        imageUrl: l.listing.images[0]?.url,
        unitAmountCents: l.unitPriceCents,
        quantity: l.quantity,
      })),
    ),
  );
  for (const s of priced.sellers) {
    if (s.shippingCents > 0) {
      lines.push({ name: `Shipping from ${s.seller.shopName}`, description: "", imageUrl: undefined, unitAmountCents: s.shippingCents, quantity: 1 });
    }
  }

  const session = await payments().createCheckoutSession({
    orderId: order.id,
    orderNumber: order.number,
    email: input.email,
    lines,
    successUrl: `${env.appUrl}/checkout/success?order=${order.id}&t=${order.accessToken}`,
    cancelUrl: `${env.appUrl}/cart?canceled=1`,
  });
  await db.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
  return { orderId: order.id, url: session.url };
}
