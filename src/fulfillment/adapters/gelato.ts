/**
 * Gelato adapter. API reference: https://dashboard.gelato.com/docs/
 *
 * Sellers connect with an API key (Gelato dashboard → Developer → API keys).
 * Gelato routes production to a printer near the buyer, which keeps shipping
 * short internationally. Orders are billed to the seller's Gelato account.
 *
 * Webhooks: add {APP_URL}/api/webhooks/fulfillment/gelato?token={GELATO_WEBHOOK_SECRET}
 * in the Gelato dashboard for order_status_updated and
 * order_item_tracking_code_updated. (Gelato webhooks are configured per account
 * in the dashboard, so each seller adds the URL shown on their partners page.)
 */
import type { CatalogProduct, FulfillmentProvider, FulfillmentStatus, ProviderContext, ShipTo } from "../types";
import {
  eventId,
  mockBackend,
  mockTracking,
  partnerFetch,
  requireCredential,
  toCents,
  verifyQueryToken,
  webhookSecret,
} from "../shared";

const ORDER_API = "https://order.gelatoapis.com/v4";
const PRODUCT_API = "https://product.gelatoapis.com/v3";
const WEBHOOK_SECRET_ENV = "GELATO_WEBHOOK_SECRET";

const CATALOG: CatalogProduct[] = [
  {
    id: "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_m_gco_white_gpr_4-4",
    productType: "tshirt",
    name: "Classic Unisex Crewneck T-shirt",
    baseCostCents: 1050,
    typicalShippingCents: 449,
    mockupSupported: false,
    variants: [
      { id: "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_s_gco_white_gpr_4-4", name: "S / White", size: "S", color: "White", baseCostCents: 1050 },
      { id: "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_m_gco_white_gpr_4-4", name: "M / White", size: "M", color: "White", baseCostCents: 1050 },
      { id: "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_l_gco_white_gpr_4-4", name: "L / White", size: "L", color: "White", baseCostCents: 1050 },
    ],
  },
  {
    id: "apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_heavy-blend_gsi_m_gco_black_gpr_4-0",
    productType: "hoodie",
    name: "Unisex Heavy Blend Hoodie",
    baseCostCents: 2390,
    typicalShippingCents: 799,
    mockupSupported: false,
    variants: [
      { id: "apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_heavy-blend_gsi_m_gco_black_gpr_4-0", name: "M / Black", size: "M", color: "Black", baseCostCents: 2390 },
      { id: "apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_heavy-blend_gsi_l_gco_black_gpr_4-0", name: "L / Black", size: "L", color: "Black", baseCostCents: 2390 },
    ],
  },
  {
    id: "mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0",
    productType: "mug",
    name: "Ceramic Mug 11 oz",
    baseCostCents: 690,
    typicalShippingCents: 599,
    mockupSupported: false,
    variants: [{ id: "mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0", name: "11 oz / White", baseCostCents: 690 }],
  },
  {
    id: "flat_product_pf_300x400-mm_pt_200-gsm-80lb-uncoated_cl_4-0_ver",
    productType: "poster",
    name: "Museum-quality matte poster",
    baseCostCents: 890,
    typicalShippingCents: 549,
    mockupSupported: false,
    variants: [
      { id: "flat_product_pf_300x400-mm_pt_200-gsm-80lb-uncoated_cl_4-0_ver", name: "30 × 40 cm (12″ × 16″)", baseCostCents: 890 },
      { id: "flat_product_pf_500x700-mm_pt_200-gsm-80lb-uncoated_cl_4-0_ver", name: "50 × 70 cm (20″ × 28″)", baseCostCents: 1490 },
    ],
  },
  {
    id: "canvas_300x400-mm-12x16-inch_canvas_wood-fsc-slim_4-0_ver",
    productType: "canvas",
    name: "Slim canvas",
    baseCostCents: 2290,
    typicalShippingCents: 899,
    mockupSupported: false,
    variants: [{ id: "canvas_300x400-mm-12x16-inch_canvas_wood-fsc-slim_4-0_ver", name: '12″ × 16″', baseCostCents: 2290 }],
  },
  {
    id: "bag_product_bsc_tote-bag_bqa_clc_bsi_std-t_bco_natural_bpr_4-0",
    productType: "tote",
    name: "Classic tote bag",
    baseCostCents: 1190,
    typicalShippingCents: 449,
    mockupSupported: false,
    variants: [{ id: "bag_product_bsc_tote-bag_bqa_clc_bsi_std-t_bco_natural_bpr_4-0", name: "Natural", baseCostCents: 1190 }],
  },
];

const mock = mockBackend("gelato", CATALOG);

function headers(ctx: ProviderContext): HeadersInit {
  return { "X-API-KEY": requireCredential(ctx.credentials, "apiKey", "Gelato") };
}

function splitName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { firstName: first ?? name, lastName: rest.join(" ") || "-" };
}

function address(shipTo: ShipTo) {
  return {
    ...splitName(shipTo.name),
    addressLine1: shipTo.line1,
    addressLine2: shipTo.line2 ?? undefined,
    city: shipTo.city,
    postCode: shipTo.postalCode,
    state: shipTo.state ?? undefined,
    country: shipTo.country,
    email: shipTo.email ?? undefined,
    phone: shipTo.phone ?? undefined,
  };
}

function mapStatus(status: string | undefined): FulfillmentStatus {
  switch (status) {
    case "passed":
    case "printed":
      return "IN_PRODUCTION";
    case "shipped":
    case "in_transit":
      return "SHIPPED";
    case "delivered":
      return "DELIVERED";
    case "failed":
    case "returned":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    default:
      return "SUBMITTED"; // created, draft, pending_approval, on_hold
  }
}

const gelato: FulfillmentProvider = {
  id: "gelato",
  name: "Gelato",
  kind: "pod",
  tagline: "Prints locally in 30+ countries for fast international delivery.",
  website: "https://www.gelato.com",
  auth: {
    type: "API_KEY",
    keyHelpUrl: "https://dashboard.gelato.com/docs/get-started/",
    fields: [{ key: "apiKey", label: "API key", secret: true, help: "Gelato dashboard → Developer → API keys" }],
  },
  capabilities: { mockups: false, webhooks: true, tracking: "partner" },
  productTypes: ["tshirt", "hoodie", "mug", "poster", "canvas", "tote"],

  async verifyConnection(ctx) {
    if (ctx.mock) return { accountLabel: "Demo Gelato account", externalShopId: null };
    await partnerFetch("Gelato", `${PRODUCT_API}/catalogs`, { headers: headers(ctx) });
    return { accountLabel: "Gelato account", externalShopId: null };
  },

  async listCatalog(ctx) {
    if (ctx.mock) return mock.listCatalog();
    return Promise.all(
      CATALOG.map(async (p) => {
        try {
          const prices = await partnerFetch<Array<{ quantity: number; price: number; country: string }>>(
            "Gelato",
            `${PRODUCT_API}/products/${encodeURIComponent(p.id)}/prices?country=US&currency=USD`,
            { headers: headers(ctx) },
          );
          const one = prices.find((x) => x.quantity === 1) ?? prices[0];
          return one ? { ...p, baseCostCents: toCents(one.price) } : p;
        } catch {
          return p;
        }
      }),
    );
  },

  async getQuote(ctx, items, shipTo) {
    if (ctx.mock || !shipTo) return mock.getQuote(items, shipTo);
    const res = await partnerFetch<{
      quotes: Array<{
        products: Array<{ price: number }>;
        shipmentMethods: Array<{ shipmentMethodUid: string; price: number; minDeliveryDays: number; maxDeliveryDays: number; type: string }>;
      }>;
    }>("Gelato", `${ORDER_API}/orders:quote`, {
      method: "POST",
      headers: headers(ctx),
      json: {
        orderReferenceId: `quote-${Date.now()}`,
        customerReferenceId: "synthora",
        currency: "USD",
        allowMultipleQuotes: false,
        recipient: address(shipTo),
        products: items.map((i, idx) => ({
          itemReferenceId: `item-${idx}`,
          productUid: i.partnerVariantId ?? i.partnerProductId,
          quantity: i.quantity,
        })),
      },
    });
    const quote = res.quotes[0];
    const method =
      quote?.shipmentMethods.find((m) => m.type === "normal") ??
      [...(quote?.shipmentMethods ?? [])].sort((a, b) => a.price - b.price)[0];
    return {
      productionCents: toCents(quote?.products.reduce((a, p) => a + p.price, 0) ?? 0),
      shippingCents: toCents(method?.price ?? 0),
      currency: "usd",
      minDays: method?.minDeliveryDays ?? 3,
      maxDays: method?.maxDeliveryDays ?? 8,
      methodId: method?.shipmentMethodUid,
    };
  },

  async createOrder(ctx, order) {
    if (ctx.mock) return mock.createOrder(order);
    if (!order.shipTo) throw new Error("Gelato orders need a shipping address");
    const res = await partnerFetch<{ id: string; fulfillmentStatus: string }>("Gelato", `${ORDER_API}/orders`, {
      method: "POST",
      headers: headers(ctx),
      json: {
        orderType: "order",
        orderReferenceId: order.externalId,
        customerReferenceId: "synthora",
        currency: "USD",
        items: order.items.map((i, idx) => ({
          itemReferenceId: `${order.externalId}-${idx}`,
          productUid: i.partnerVariantId ?? i.partnerProductId,
          files: i.designUrl ? [{ type: "default", url: i.designUrl }] : [],
          quantity: i.quantity,
        })),
        shipmentMethodUid: order.shippingMethodId,
        shippingAddress: address(order.shipTo),
      },
    });
    return { partnerOrderId: res.id, status: mapStatus(res.fulfillmentStatus), raw: res };
  },

  async findOrder(ctx, externalId) {
    if (ctx.mock) return mock.findOrder(externalId);
    const res = await partnerFetch<{ orders?: Array<{ id: string; fulfillmentStatus: string; orderReferenceId?: string }> }>("Gelato", `${ORDER_API}/orders:search`, {
      method: "POST",
      headers: headers(ctx),
      json: { orderReferenceIds: [externalId], limit: 5 },
    });
    const o = res.orders?.find((x) => x.orderReferenceId === externalId) ?? res.orders?.[0];
    return o ? { partnerOrderId: o.id, status: mapStatus(o.fulfillmentStatus), raw: o } : null;
  },

  async getStatus(ctx, partnerOrderId) {
    if (ctx.mock) return mock.getStatus(partnerOrderId);
    const o = await partnerFetch<{
      fulfillmentStatus: string;
      items?: Array<{ fulfillments?: Array<{ trackingCode?: string; trackingUrl?: string; shipmentMethodName?: string }> }>;
    }>("Gelato", `${ORDER_API}/orders/${encodeURIComponent(partnerOrderId)}`, { headers: headers(ctx) });
    const f = o.items?.flatMap((i) => i.fulfillments ?? [])[0];
    return {
      status: mapStatus(o.fulfillmentStatus),
      tracking: f ? { carrier: f.shipmentMethodName, number: f.trackingCode, url: f.trackingUrl } : undefined,
      failureReason: o.fulfillmentStatus === "failed" ? "Gelato could not produce this order" : null,
      raw: o,
    };
  },

  async cancel(ctx, partnerOrderId) {
    if (ctx.mock) return mock.cancel(partnerOrderId);
    try {
      await partnerFetch("Gelato", `${ORDER_API}/orders/${encodeURIComponent(partnerOrderId)}:cancel`, {
        method: "POST",
        headers: headers(ctx),
      });
      return { canceled: true };
    } catch (e) {
      return { canceled: false, reason: e instanceof Error ? e.message : "Cancel failed" };
    }
  },

  async handleWebhook(req) {
    verifyQueryToken(req, WEBHOOK_SECRET_ENV);
    const body = JSON.parse(req.rawBody) as {
      id: string;
      event: string;
      orderId: string;
      fulfillmentStatus?: string;
      trackingCode?: string;
      trackingUrl?: string;
      shipmentMethodName?: string;
      items?: Array<{ fulfillments?: Array<{ trackingCode?: string; trackingUrl?: string; shipmentMethodName?: string }> }>;
    };
    if (!body.orderId) return [];
    const f = body.items?.flatMap((i) => i.fulfillments ?? [])[0];
    const tracking =
      body.trackingCode || f?.trackingCode
        ? {
            carrier: body.shipmentMethodName ?? f?.shipmentMethodName,
            number: body.trackingCode ?? f?.trackingCode,
            url: body.trackingUrl ?? f?.trackingUrl,
          }
        : undefined;
    const status =
      body.event === "order_status_updated"
        ? mapStatus(body.fulfillmentStatus)
        : body.event === "order_item_tracking_code_updated"
          ? "SHIPPED"
          : undefined;
    const update = {
      eventId: eventId("gelato", body.id),
      partnerOrderId: body.orderId,
      status,
      tracking,
      failureReason: body.fulfillmentStatus === "failed" ? "Gelato could not produce this order" : null,
    };
    mock.remember(update);
    return [update];
  },

  buildMockWebhook(partnerOrderId, status, tracking) {
    const t = mockTracking(status, tracking);
    const gelatoStatus: Record<string, string> = {
      PENDING: "created",
      SUBMITTED: "created",
      IN_PRODUCTION: "printed",
      SHIPPED: "shipped",
      DELIVERED: "delivered",
      FAILED: "failed",
      CANCELED: "canceled",
    };
    const rawBody = JSON.stringify({
      id: `os_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event: "order_status_updated",
      orderId: partnerOrderId,
      fulfillmentStatus: gelatoStatus[status],
      items: t ? [{ fulfillments: [{ trackingCode: t.number, trackingUrl: t.url, shipmentMethodName: t.carrier }] }] : [],
    });
    return {
      headers: new Headers(),
      rawBody,
      query: new URLSearchParams({ token: webhookSecret(WEBHOOK_SECRET_ENV) }),
    };
  },
};

export default gelato;
