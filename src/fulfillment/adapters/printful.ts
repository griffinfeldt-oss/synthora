/**
 * Printful adapter. API reference: https://developers.printful.com/docs/
 *
 * Sellers connect with a private token (Printful → Settings → API) or, when
 * PRINTFUL_CLIENT_ID / PRINTFUL_CLIENT_SECRET are set, with OAuth.
 * Orders go to the seller's Printful store and are charged to their Printful
 * billing method.
 *
 * Webhooks: registered on connect at
 *   {APP_URL}/api/webhooks/fulfillment/printful?token={PRINTFUL_WEBHOOK_SECRET}
 * Printful's v1 webhooks are unsigned, so the URL token authenticates them.
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

const API = "https://api.printful.com";
const WEBHOOK_SECRET_ENV = "PRINTFUL_WEBHOOK_SECRET";

const CATALOG: CatalogProduct[] = [
  {
    id: "71",
    productType: "tshirt",
    name: "Unisex Staple T-Shirt (Bella+Canvas 3001)",
    baseCostCents: 1169,
    typicalShippingCents: 475,
    mockupSupported: true,
    data: { placement: "front" },
    variants: [
      { id: "4011", name: "S / White", size: "S", color: "White", baseCostCents: 1169 },
      { id: "4012", name: "M / White", size: "M", color: "White", baseCostCents: 1169 },
      { id: "4013", name: "L / White", size: "L", color: "White", baseCostCents: 1169 },
      { id: "4014", name: "XL / White", size: "XL", color: "White", baseCostCents: 1169 },
      { id: "4017", name: "S / Black", size: "S", color: "Black", baseCostCents: 1169 },
      { id: "4018", name: "M / Black", size: "M", color: "Black", baseCostCents: 1169 },
      { id: "4019", name: "L / Black", size: "L", color: "Black", baseCostCents: 1169 },
    ],
  },
  {
    id: "146",
    productType: "hoodie",
    name: "Unisex Heavy Blend Hoodie (Gildan 18500)",
    baseCostCents: 2295,
    typicalShippingCents: 849,
    mockupSupported: true,
    data: { placement: "front" },
    variants: [
      { id: "5530", name: "S / Black", size: "S", color: "Black", baseCostCents: 2295 },
      { id: "5531", name: "M / Black", size: "M", color: "Black", baseCostCents: 2295 },
      { id: "5532", name: "L / Black", size: "L", color: "Black", baseCostCents: 2295 },
    ],
  },
  {
    id: "19",
    productType: "mug",
    name: "White Glossy Mug",
    baseCostCents: 675,
    typicalShippingCents: 649,
    mockupSupported: true,
    data: { placement: "default" },
    variants: [
      { id: "1320", name: "11 oz", size: "11oz", baseCostCents: 675 },
      { id: "4830", name: "15 oz", size: "15oz", baseCostCents: 875 },
    ],
  },
  {
    id: "1",
    productType: "poster",
    name: "Enhanced Matte Paper Poster",
    baseCostCents: 1325,
    typicalShippingCents: 599,
    mockupSupported: true,
    data: { placement: "default" },
    variants: [
      { id: "1349", name: '12″ × 16″', size: "12x16", baseCostCents: 1050 },
      { id: "1", name: '18″ × 24″', size: "18x24", baseCostCents: 1325 },
      { id: "2", name: '24″ × 36″', size: "24x36", baseCostCents: 1750 },
    ],
  },
  {
    id: "3",
    productType: "canvas",
    name: "Canvas (in)",
    baseCostCents: 2495,
    typicalShippingCents: 999,
    mockupSupported: true,
    data: { placement: "default" },
    variants: [
      { id: "823", name: '12″ × 16″', size: "12x16", baseCostCents: 2495 },
      { id: "824", name: '16″ × 20″', size: "16x20", baseCostCents: 3195 },
    ],
  },
  {
    id: "84",
    productType: "tote",
    name: "Eco Tote Bag",
    baseCostCents: 1450,
    typicalShippingCents: 475,
    mockupSupported: true,
    data: { placement: "front" },
    variants: [{ id: "4533", name: "Oyster", color: "Natural", baseCostCents: 1450 }],
  },
  {
    id: "358",
    productType: "sticker",
    name: "Kiss-Cut Stickers",
    baseCostCents: 248,
    typicalShippingCents: 399,
    mockupSupported: true,
    data: { placement: "default" },
    variants: [
      { id: "10163", name: '3″ × 3″', size: "3x3", baseCostCents: 248 },
      { id: "10164", name: '4″ × 4″', size: "4x4", baseCostCents: 275 },
    ],
  },
  {
    id: "181",
    productType: "phonecase",
    name: "Tough Case for iPhone",
    baseCostCents: 1295,
    typicalShippingCents: 449,
    mockupSupported: true,
    data: { placement: "default" },
    variants: [{ id: "17616", name: "iPhone 15", size: "iPhone 15", baseCostCents: 1295 }],
  },
];

const mock = mockBackend("printful", CATALOG);

function headers(ctx: ProviderContext): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${requireCredential(ctx.credentials, "apiToken", "Printful")}`,
  };
  if (ctx.externalShopId) h["X-PF-Store-Id"] = ctx.externalShopId;
  return h;
}

function recipient(shipTo: ShipTo) {
  return {
    name: shipTo.name,
    address1: shipTo.line1,
    address2: shipTo.line2 ?? undefined,
    city: shipTo.city,
    state_code: shipTo.state ?? undefined,
    country_code: shipTo.country,
    zip: shipTo.postalCode,
    email: shipTo.email ?? undefined,
    phone: shipTo.phone ?? undefined,
  };
}

function mapStatus(status: string | undefined): FulfillmentStatus {
  switch (status) {
    case "inprocess":
      return "IN_PRODUCTION";
    case "partial":
    case "fulfilled":
      return "SHIPPED";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    default:
      return "SUBMITTED"; // draft, pending, onhold
  }
}

type PfResult<T> = { code: number; result: T };

const printful: FulfillmentProvider = {
  id: "printful",
  name: "Printful",
  kind: "pod",
  tagline: "Consistent quality, in-house production, built-in mockups.",
  website: "https://www.printful.com",
  auth: {
    type: "API_KEY",
    keyHelpUrl: "https://developers.printful.com/docs/#section/Authorization",
    fields: [{ key: "apiToken", label: "Private token", secret: true, help: "Printful → Settings → API → Create token" }],
    oauth: {
      enabledEnv: ["PRINTFUL_CLIENT_ID", "PRINTFUL_CLIENT_SECRET"],
      authorizeUrl: (state, redirectUri) =>
        `https://www.printful.com/oauth/authorize?client_id=${encodeURIComponent(
          process.env.PRINTFUL_CLIENT_ID ?? "",
        )}&redirect_url=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
      exchangeCode: async (code) => {
        const res = await partnerFetch<{ access_token: string; refresh_token: string; expires_at: number }>(
          "Printful",
          "https://www.printful.com/oauth/token",
          {
            method: "POST",
            json: {
              grant_type: "authorization_code",
              client_id: process.env.PRINTFUL_CLIENT_ID,
              client_secret: process.env.PRINTFUL_CLIENT_SECRET,
              code,
            },
          },
        );
        return { apiToken: res.access_token, refreshToken: res.refresh_token, expiresAt: String(res.expires_at) };
      },
    },
  },
  capabilities: { mockups: true, webhooks: true, tracking: "partner" },
  productTypes: ["tshirt", "hoodie", "mug", "poster", "canvas", "tote", "sticker", "phonecase"],

  async verifyConnection(ctx) {
    if (ctx.mock) return { accountLabel: "Demo Printful store", externalShopId: null };
    const res = await partnerFetch<PfResult<Array<{ id: number; name: string }>>>("Printful", `${API}/stores`, {
      headers: headers(ctx),
    });
    const store = res.result[0];
    if (!store) throw new Error("No Printful store found on this account.");
    return { accountLabel: store.name, externalShopId: res.result.length > 1 ? String(store.id) : null };
  },

  async registerWebhooks(ctx, webhookUrl) {
    if (ctx.mock || !process.env[WEBHOOK_SECRET_ENV]) return;
    const url = `${webhookUrl}?token=${encodeURIComponent(webhookSecret(WEBHOOK_SECRET_ENV))}`;
    await partnerFetch("Printful", `${API}/webhooks`, {
      method: "POST",
      headers: headers(ctx),
      json: { url, types: ["package_shipped", "order_failed", "order_canceled", "order_put_hold", "order_updated"] },
    });
  },

  async listCatalog(ctx) {
    if (ctx.mock) return mock.listCatalog();
    return Promise.all(
      CATALOG.map(async (p) => {
        try {
          const res = await partnerFetch<
            PfResult<{ variants: Array<{ id: number; name: string; size: string; color: string; price: string }> }>
          >("Printful", `${API}/products/${p.id}`, { headers: headers(ctx) });
          const variants = res.result.variants.slice(0, 40).map((v) => ({
            id: String(v.id),
            name: v.name,
            size: v.size,
            color: v.color,
            baseCostCents: toCents(v.price),
          }));
          return { ...p, variants, baseCostCents: variants[0]?.baseCostCents ?? p.baseCostCents };
        } catch {
          return p;
        }
      }),
    );
  },

  async getQuote(ctx, items, shipTo) {
    if (ctx.mock || !shipTo) return mock.getQuote(items, shipTo);
    const res = await partnerFetch<
      PfResult<Array<{ id: string; rate: string; minDeliveryDays: number; maxDeliveryDays: number }>>
    >("Printful", `${API}/shipping/rates`, {
      method: "POST",
      headers: headers(ctx),
      json: {
        recipient: recipient(shipTo),
        items: items.map((i) => ({ variant_id: Number(i.partnerVariantId), quantity: i.quantity })),
        currency: "USD",
      },
    });
    const rate = res.result.find((r) => r.id === "STANDARD") ?? res.result[0];
    return {
      productionCents: items.reduce((a, i) => a + i.baseCostCents * i.quantity, 0),
      shippingCents: toCents(rate?.rate),
      currency: "usd",
      minDays: rate?.minDeliveryDays ?? 4,
      maxDays: rate?.maxDeliveryDays ?? 10,
      methodId: rate?.id ?? "STANDARD",
    };
  },

  async createOrder(ctx, order) {
    if (ctx.mock) return mock.createOrder(order);
    if (!order.shipTo) throw new Error("Printful orders need a shipping address");
    const res = await partnerFetch<PfResult<{ id: number; status: string }>>("Printful", `${API}/orders?confirm=true`, {
      method: "POST",
      headers: headers(ctx),
      json: {
        external_id: order.externalId,
        shipping: order.shippingMethodId ?? "STANDARD",
        recipient: recipient(order.shipTo),
        items: order.items.map((i) => ({
          variant_id: Number(i.partnerVariantId),
          quantity: i.quantity,
          name: i.title,
          files: i.designUrl
            ? [{ type: ((i.partnerData ?? {}) as { placement?: string }).placement ?? "default", url: i.designUrl }]
            : [],
        })),
      },
    });
    return { partnerOrderId: String(res.result.id), status: mapStatus(res.result.status), raw: res.result };
  },

  async getStatus(ctx, partnerOrderId) {
    if (ctx.mock) return mock.getStatus(partnerOrderId);
    const res = await partnerFetch<
      PfResult<{
        status: string;
        shipments?: Array<{ carrier: string; tracking_number: string; tracking_url: string; delivered?: boolean }>;
      }>
    >("Printful", `${API}/orders/${partnerOrderId}`, { headers: headers(ctx) });
    const s = res.result.shipments?.[0];
    return {
      status: s?.delivered ? "DELIVERED" : mapStatus(res.result.status),
      tracking: s ? { carrier: s.carrier, number: s.tracking_number, url: s.tracking_url } : undefined,
      failureReason: res.result.status === "failed" ? "Printful could not fulfil this order" : null,
      raw: res.result,
    };
  },

  async cancel(ctx, partnerOrderId) {
    if (ctx.mock) return mock.cancel(partnerOrderId);
    try {
      await partnerFetch("Printful", `${API}/orders/${partnerOrderId}`, { method: "DELETE", headers: headers(ctx) });
      return { canceled: true };
    } catch (e) {
      return { canceled: false, reason: e instanceof Error ? e.message : "Cancel failed" };
    }
  },

  async createMockups(ctx, input) {
    if (ctx.mock) return null;
    const placement = ((input.partnerData ?? {}) as { placement?: string }).placement ?? "front";
    const task = await partnerFetch<PfResult<{ task_key: string }>>(
      "Printful",
      `${API}/mockup-generator/create-task/${input.partnerProductId}`,
      {
        method: "POST",
        headers: headers(ctx),
        json: {
          variant_ids: input.partnerVariantIds.slice(0, 3).map(Number),
          format: "jpg",
          files: [{ placement, image_url: input.designUrl }],
        },
      },
    );
    // The generator is asynchronous; poll briefly.
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await partnerFetch<PfResult<{ status: string; mockups?: Array<{ mockup_url: string }> }>>(
        "Printful",
        `${API}/mockup-generator/task?task_key=${encodeURIComponent(task.result.task_key)}`,
        { headers: headers(ctx) },
      );
      if (res.result.status === "completed") return (res.result.mockups ?? []).map((m) => m.mockup_url).slice(0, 4);
      if (res.result.status === "failed") return null;
    }
    return null;
  },

  async handleWebhook(req) {
    verifyQueryToken(req, WEBHOOK_SECRET_ENV);
    const body = JSON.parse(req.rawBody) as {
      type: string;
      created: number;
      data?: {
        order?: { id: number; status?: string };
        shipment?: { id?: number; carrier?: string; tracking_number?: string; tracking_url?: string };
        reason?: string;
      };
    };
    const order = body.data?.order;
    if (!order) return [];
    let status: FulfillmentStatus | undefined;
    if (body.type === "package_shipped") status = "SHIPPED";
    else if (body.type === "order_failed") status = "FAILED";
    else if (body.type === "order_canceled") status = "CANCELED";
    else if (body.type === "order_updated") status = mapStatus(order.status);
    else if (body.type === "package_delivered") status = "DELIVERED";
    const s = body.data?.shipment;
    const update = {
      eventId: eventId("printful", body.type, order.id, body.created, s?.id),
      partnerOrderId: String(order.id),
      status,
      tracking: s ? { carrier: s.carrier, number: s.tracking_number, url: s.tracking_url } : undefined,
      failureReason: body.type === "order_failed" ? body.data?.reason ?? "Printful could not fulfil this order" : null,
      occurredAt: new Date(body.created * 1000),
    };
    mock.remember(update);
    return [update];
  },

  buildMockWebhook(partnerOrderId, status, tracking) {
    const t = mockTracking(status, tracking);
    const type =
      status === "SHIPPED"
        ? "package_shipped"
        : status === "DELIVERED"
          ? "package_delivered"
          : status === "FAILED"
            ? "order_failed"
            : status === "CANCELED"
              ? "order_canceled"
              : "order_updated";
    const rawBody = JSON.stringify({
      type,
      created: Math.floor(Date.now() / 1000),
      retries: 0,
      data: {
        order: { id: partnerOrderId, status: status === "IN_PRODUCTION" ? "inprocess" : "pending" },
        shipment: t ? { id: Date.now(), carrier: t.carrier, tracking_number: t.number, tracking_url: t.url } : undefined,
        reason: status === "FAILED" ? "Print file could not be processed" : undefined,
      },
    });
    return {
      headers: new Headers(),
      rawBody,
      query: new URLSearchParams({ token: webhookSecret(WEBHOOK_SECRET_ENV) }),
    };
  },
};

export default printful;
