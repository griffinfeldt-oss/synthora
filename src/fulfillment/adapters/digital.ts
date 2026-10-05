/**
 * "Digital delivery". After payment the buyer gets a short-lived signed link to
 * the file (src/app/api/download). Nothing ships; the order is delivered at once.
 */
import type { CatalogProduct, FulfillmentProvider } from "../types";
import { PRODUCT_TYPES } from "@/config/catalog";

const CATALOG: CatalogProduct[] = PRODUCT_TYPES.filter((p) => p.kinds.includes("DIGITAL")).map((p) => ({
  id: `digital-${p.id}`,
  productType: p.id,
  name: p.label,
  baseCostCents: 0,
  typicalShippingCents: 0,
  mockupSupported: false,
  variants: [{ id: `digital-${p.id}-file`, name: "Download", baseCostCents: 0 }],
}));

const digital: FulfillmentProvider = {
  id: "digital",
  name: "Digital delivery",
  kind: "digital",
  tagline: "Buyers download the file right after paying.",
  auth: { type: "NONE" },
  capabilities: { mockups: false, webhooks: false, tracking: "none" },
  productTypes: PRODUCT_TYPES.filter((p) => p.kinds.includes("DIGITAL")).map((p) => p.id),

  async verifyConnection() {
    return { accountLabel: "Secure downloads" };
  },
  async listCatalog() {
    return CATALOG;
  },
  async getQuote() {
    return { productionCents: 0, shippingCents: 0, currency: "usd", minDays: 0, maxDays: 0 };
  },
  async createOrder(_ctx, order) {
    return { partnerOrderId: `dl_${order.externalId}`, status: "DELIVERED" };
  },
  async getStatus() {
    return { status: "DELIVERED" };
  },
  async cancel() {
    return { canceled: true };
  },
  async handleWebhook() {
    return [];
  },
};

export default digital;
