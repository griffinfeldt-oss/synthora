/**
 * "I ship it myself". No partner API: the seller packs the order and enters
 * tracking on their dashboard. Shipping is the seller's flat rate per order.
 */
import type { CatalogProduct, FulfillmentProvider } from "../types";
import { PRODUCT_TYPES } from "@/config/catalog";

const CATALOG: CatalogProduct[] = PRODUCT_TYPES.filter((p) => p.kinds.includes("SELF_SHIP")).map((p) => ({
  id: `self-${p.id}`,
  productType: p.id,
  name: p.label,
  baseCostCents: 0,
  typicalShippingCents: 500,
  mockupSupported: false,
  variants: [{ id: `self-${p.id}-default`, name: "Standard", baseCostCents: 0 }],
}));

const selfShip: FulfillmentProvider = {
  id: "self",
  name: "I ship it myself",
  kind: "self",
  tagline: "You pack and post it, then add the tracking number.",
  auth: { type: "NONE" },
  capabilities: { mockups: false, webhooks: false, tracking: "seller" },
  productTypes: PRODUCT_TYPES.filter((p) => p.kinds.includes("SELF_SHIP")).map((p) => p.id),

  async verifyConnection() {
    return { accountLabel: "Ships from you" };
  },
  async listCatalog() {
    return CATALOG;
  },
  async getQuote(_ctx, items) {
    // One parcel per seller order: charge the highest flat rate among the items.
    const shippingCents = items.reduce((max, i) => Math.max(max, i.flatShippingCents ?? 0), 0);
    return { productionCents: 0, shippingCents, currency: "usd", minDays: 3, maxDays: 10 };
  },
  async createOrder(_ctx, order) {
    // Nothing to send anywhere; the seller is notified and ships it.
    return { partnerOrderId: `self_${order.externalId}`, status: "PENDING" };
  },
  async getStatus() {
    return { status: "PENDING" };
  },
  async cancel() {
    return { canceled: true };
  },
  async handleWebhook() {
    return [];
  },
};

export default selfShip;
