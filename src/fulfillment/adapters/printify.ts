/**
 * Printify adapter. API reference: https://developers.printify.com/
 *
 * Seller connects with a Personal Access Token (Printify → My account →
 * Connections → API tokens) and optionally a shop id. Orders are created in
 * the seller's Printify shop and billed to the seller's Printify account.
 *
 * Webhooks: registered per shop on connect (order:updated,
 * order:shipment:created, order:shipment:delivered), signed with
 * PRINTIFY_WEBHOOK_SECRET in the `X-Pfy-Signature: sha256=<hmac>` header.
 */
import type {
  CatalogProduct,
  FulfillmentProvider,
  FulfillmentStatus,
  PartnerUpdate,
  ProviderContext,
  ShipTo,
} from "../types";
import { WebhookSignatureError } from "../types";
import {
  eventId,
  hmacSha256Hex,
  mockBackend,
  mockTracking,
  partnerFetch,
  requireCredential,
  webhookSecret,
} from "../shared";
import { safeEqual } from "@/lib/crypto";

const API = "https://api.printify.com/v1";
const WEBHOOK_SECRET_ENV = "PRINTIFY_WEBHOOK_SECRET";

/**
 * Curated products. Base costs are typical Printify prices (USD) and are shown
 * to sellers as estimates; the exact cost is on the seller's Printify invoice.
 */
const CATALOG: CatalogProduct[] = [
  {
    id: "6",
    productType: "tshirt",
    name: "Unisex Heavy Cotton Tee (Gildan 5000)",
    baseCostCents: 807,
    typicalShippingCents: 475,
    mockupSupported: true,
    data: { blueprintId: 6, printProviderId: 99, position: "front" },
    variants: [
      { id: "12100", name: "S / White", size: "S", color: "White", baseCostCents: 807 },
      { id: "12101", name: "M / White", size: "M", color: "White", baseCostCents: 807 },
      { id: "12102", name: "L / White", size: "L", color: "White", baseCostCents: 807 },
      { id: "12103", name: "XL / White", size: "XL", color: "White", baseCostCents: 807 },
      { id: "12104", name: "2XL / White", size: "2XL", color: "White", baseCostCents: 1032 },
    ],
  },
  {
    id: "77",
    productType: "hoodie",
    name: "Unisex Heavy Blend Hooded Sweatshirt (Gildan 18500)",
    baseCostCents: 2050,
    typicalShippingCents: 849,
    mockupSupported: true,
    data: { blueprintId: 77, printProviderId: 99, position: "front" },
    variants: [
      { id: "32918", name: "S / Black", size: "S", color: "Black", baseCostCents: 2050 },
      { id: "32919", name: "M / Black", size: "M", color: "Black", baseCostCents: 2050 },
      { id: "32920", name: "L / Black", size: "L", color: "Black", baseCostCents: 2050 },
      { id: "32921", name: "XL / Black", size: "XL", color: "Black", baseCostCents: 2050 },
    ],
  },
  {
    id: "68",
    productType: "mug",
    name: "Ceramic Mug 11oz",
    baseCostCents: 470,
    typicalShippingCents: 699,
    mockupSupported: true,
    data: { blueprintId: 68, printProviderId: 1, position: "front" },
    variants: [{ id: "33719", name: "11oz / White", size: "11oz", color: "White", baseCostCents: 470 }],
  },
  {
    id: "282",
    productType: "poster",
    name: "Matte Vertical Poster",
    baseCostCents: 800,
    typicalShippingCents: 499,
    mockupSupported: true,
    data: { blueprintId: 282, printProviderId: 2, position: "front" },
    variants: [
      { id: "43135", name: '12″ × 18″', size: "12x18", baseCostCents: 800 },
      { id: "43141", name: '18″ × 24″', size: "18x24", baseCostCents: 1150 },
      { id: "43144", name: '24″ × 36″', size: "24x36", baseCostCents: 1650 },
    ],
  },
  {
    id: "50",
    productType: "canvas",
    name: "Canvas Gallery Wrap",
    baseCostCents: 2050,
    typicalShippingCents: 899,
    mockupSupported: true,
    data: { blueprintId: 50, printProviderId: 2, position: "front" },
    variants: [
      { id: "64860", name: '12″ × 16″', size: "12x16", baseCostCents: 2050 },
      { id: "64863", name: '16″ × 20″', size: "16x20", baseCostCents: 2690 },
    ],
  },
  {
    id: "553",
    productType: "tote",
    name: "Cotton Canvas Tote Bag",
    baseCostCents: 1180,
    typicalShippingCents: 475,
    mockupSupported: true,
    data: { blueprintId: 553, printProviderId: 99, position: "front" },
    variants: [{ id: "71877", name: "One size / Natural", size: "OS", color: "Natural", baseCostCents: 1180 }],
  },
  {
    id: "400",
    productType: "sticker",
    name: "Kiss-Cut Sticker",
    baseCostCents: 190,
    typicalShippingCents: 400,
    mockupSupported: true,
    data: { blueprintId: 400, printProviderId: 99, position: "front" },
    variants: [
      { id: "45740", name: '3″ × 3″', size: "3x3", baseCostCents: 190 },
      { id: "45748", name: '4″ × 4″', size: "4x4", baseCostCents: 220 },
    ],
  },
  {
    id: "421",
    productType: "phonecase",
    name: "Tough Phone Case",
    baseCostCents: 1160,
    typicalShippingCents: 469,
    mockupSupported: true,
    data: { blueprintId: 421, printProviderId: 23, position: "front" },
    variants: [
      { id: "62582", name: "iPhone 15 / Glossy", size: "iPhone 15", baseCostCents: 1160 },
      { id: "62583", name: "iPhone 15 Pro / Glossy", size: "iPhone 15 Pro", baseCostCents: 1160 },
    ],
  },
];

const mock = mockBackend("printify", CATALOG);

function headers(ctx: ProviderContext): HeadersInit {
  return { Authorization: `Bearer ${requireCredential(ctx.credentials, "apiToken", "Printify")}` };
}

function shopId(ctx: ProviderContext): string {
  const id = ctx.externalShopId ?? ctx.credentials?.shopId;
  if (!id) throw new Error("No Printify shop selected. Reconnect Printify and choose a shop.");
  return id;
}

function addressTo(shipTo: ShipTo) {
  const [first, ...rest] = shipTo.name.trim().split(/\s+/);
  return {
    first_name: first ?? shipTo.name,
    last_name: rest.join(" ") || "-",
    email: shipTo.email ?? undefined,
    phone: shipTo.phone ?? undefined,
    country: shipTo.country,
    region: shipTo.state ?? "",
    address1: shipTo.line1,
    address2: shipTo.line2 ?? "",
    city: shipTo.city,
    zip: shipTo.postalCode,
  };
}

function mapStatus(status: string | undefined): FulfillmentStatus {
  switch (status) {
    case "sending-to-production":
    case "in-production":
      return "IN_PRODUCTION";
    case "fulfilled":
    case "partially-fulfilled":
      return "SHIPPED";
    case "canceled":
      return "CANCELED";
    case "had-issues":
      return "FAILED";
    default:
      return "SUBMITTED"; // pending, on-hold, payment-not-received
  }
}

function numberish(v: unknown): number {
  return typeof v === "number" ? v : parseInt(String(v), 10);
}

const printify: FulfillmentProvider = {
  id: "printify",
  name: "Printify",
  kind: "pod",
  tagline: "Large network of print providers, low base costs.",
  website: "https://printify.com",
  auth: {
    type: "API_KEY",
    keyHelpUrl: "https://help.printify.com/hc/en-us/articles/4483626447249",
    fields: [
      { key: "apiToken", label: "Personal access token", secret: true, help: "Printify → My account → Connections → API tokens" },
      { key: "shopId", label: "Shop ID", optional: true, help: "Leave blank to use your first shop" },
    ],
  },
  capabilities: { mockups: true, webhooks: true, tracking: "partner" },
  productTypes: ["tshirt", "hoodie", "mug", "poster", "canvas", "tote", "sticker", "phonecase"],

  async verifyConnection(ctx) {
    if (ctx.mock) return { accountLabel: "Demo Printify shop", externalShopId: "demo-shop" };
    const shops = await partnerFetch<Array<{ id: number; title: string }>>("Printify", `${API}/shops.json`, {
      headers: headers(ctx),
    });
    const wanted = ctx.credentials?.shopId;
    const shop = wanted ? shops.find((s) => String(s.id) === String(wanted)) : shops[0];
    if (!shop) throw new Error("No Printify shop found on this account. Create a shop in Printify first.");
    return { accountLabel: shop.title, externalShopId: String(shop.id) };
  },

  async registerWebhooks(ctx, webhookUrl) {
    if (ctx.mock) return;
    const secret = process.env[WEBHOOK_SECRET_ENV];
    if (!secret) return;
    for (const topic of ["order:updated", "order:shipment:created", "order:shipment:delivered"]) {
      await partnerFetch("Printify", `${API}/shops/${shopId(ctx)}/webhooks.json`, {
        method: "POST",
        headers: headers(ctx),
        json: { topic, url: webhookUrl, secret },
      }).catch(() => undefined); // already registered is fine
    }
  },

  async listCatalog(ctx) {
    if (ctx.mock) return mock.listCatalog();
    // Live: refresh variant names/ids for each curated blueprint; keep curated cost estimates.
    return Promise.all(
      CATALOG.map(async (p) => {
        const { blueprintId, printProviderId } = p.data as { blueprintId: number; printProviderId: number };
        try {
          const res = await partnerFetch<{ variants: Array<{ id: number; title: string; options: Record<string, string> }> }>(
            "Printify",
            `${API}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
            { headers: headers(ctx) },
          );
          return {
            ...p,
            variants: res.variants.slice(0, 40).map((v) => ({
              id: String(v.id),
              name: v.title,
              size: v.options?.size,
              color: v.options?.color,
              baseCostCents: p.baseCostCents,
            })),
          };
        } catch {
          return p;
        }
      }),
    );
  },

  async getQuote(ctx, items, shipTo) {
    if (ctx.mock || !shipTo) return mock.getQuote(items, shipTo);
    const res = await partnerFetch<{ standard: number; express?: number }>(
      "Printify",
      `${API}/shops/${shopId(ctx)}/orders/shipping.json`,
      {
        method: "POST",
        headers: headers(ctx),
        json: {
          line_items: items.map((i) => {
            const d = (i.partnerData ?? {}) as { blueprintId?: number; printProviderId?: number };
            return {
              blueprint_id: d.blueprintId ?? numberish(i.partnerProductId),
              print_provider_id: d.printProviderId,
              variant_id: numberish(i.partnerVariantId),
              quantity: i.quantity,
            };
          }),
          address_to: addressTo(shipTo),
        },
      },
    );
    return {
      productionCents: items.reduce((a, i) => a + i.baseCostCents * i.quantity, 0),
      shippingCents: res.standard, // Printify returns cents
      currency: "usd",
      minDays: 4,
      maxDays: shipTo.country === "US" ? 10 : 20,
      methodId: "1",
    };
  },

  async createOrder(ctx, order) {
    if (ctx.mock) return mock.createOrder(order);
    if (!order.shipTo) throw new Error("Printify orders need a shipping address");
    const created = await partnerFetch<{ id: string }>("Printify", `${API}/shops/${shopId(ctx)}/orders.json`, {
      method: "POST",
      headers: headers(ctx),
      json: {
        external_id: order.externalId,
        label: order.externalId,
        line_items: order.items.map((i) => {
          const d = (i.partnerData ?? {}) as { blueprintId?: number; printProviderId?: number; position?: string };
          return {
            blueprint_id: d.blueprintId ?? numberish(i.partnerProductId),
            print_provider_id: d.printProviderId,
            variant_id: numberish(i.partnerVariantId),
            print_areas: { [d.position ?? "front"]: i.designUrl },
            quantity: i.quantity,
          };
        }),
        shipping_method: numberish(order.shippingMethodId ?? 1),
        send_shipping_notification: false,
        address_to: addressTo(order.shipTo),
      },
    });
    await partnerFetch("Printify", `${API}/shops/${shopId(ctx)}/orders/${created.id}/send_to_production.json`, {
      method: "POST",
      headers: headers(ctx),
    });
    return { partnerOrderId: String(created.id), status: "SUBMITTED", raw: created };
  },

  async getStatus(ctx, partnerOrderId) {
    if (ctx.mock) return mock.getStatus(partnerOrderId);
    const o = await partnerFetch<{
      status: string;
      shipments?: Array<{ carrier: string; number: string; url: string; delivered_at?: string | null }>;
    }>("Printify", `${API}/shops/${shopId(ctx)}/orders/${partnerOrderId}.json`, { headers: headers(ctx) });
    const shipment = o.shipments?.[0];
    const delivered = Boolean(shipment?.delivered_at);
    return {
      status: delivered ? "DELIVERED" : mapStatus(o.status),
      tracking: shipment ? { carrier: shipment.carrier, number: shipment.number, url: shipment.url } : undefined,
      deliveredAt: shipment?.delivered_at ? new Date(shipment.delivered_at) : null,
      failureReason: o.status === "had-issues" ? "Printify reported a problem with this order" : null,
      raw: o,
    };
  },

  async cancel(ctx, partnerOrderId) {
    if (ctx.mock) return mock.cancel(partnerOrderId);
    try {
      await partnerFetch("Printify", `${API}/shops/${shopId(ctx)}/orders/${partnerOrderId}/cancel.json`, {
        method: "POST",
        headers: headers(ctx),
      });
      return { canceled: true };
    } catch (e) {
      return { canceled: false, reason: e instanceof Error ? e.message : "Cancel failed" };
    }
  },

  async createMockups(ctx, input) {
    if (ctx.mock) return null; // our own renderer handles mock mode
    const d = (input.partnerData ?? {}) as { blueprintId?: number; printProviderId?: number; position?: string };
    const upload = await partnerFetch<{ id: string }>("Printify", `${API}/uploads/images.json`, {
      method: "POST",
      headers: headers(ctx),
      json: { file_name: "synthora-design.png", url: input.designUrl },
    });
    const variantIds = input.partnerVariantIds.map(numberish);
    const product = await partnerFetch<{ images: Array<{ src: string; is_default: boolean }> }>(
      "Printify",
      `${API}/shops/${shopId(ctx)}/products.json`,
      {
        method: "POST",
        headers: headers(ctx),
        json: {
          title: "Synthora mockup",
          description: "Created by Synthora to render product photos.",
          blueprint_id: d.blueprintId ?? numberish(input.partnerProductId),
          print_provider_id: d.printProviderId,
          variants: variantIds.map((id) => ({ id, price: 100, is_enabled: true })),
          print_areas: [
            {
              variant_ids: variantIds,
              placeholders: [{ position: d.position ?? "front", images: [{ id: upload.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }],
            },
          ],
        },
      },
    );
    return product.images.sort((a, b) => Number(b.is_default) - Number(a.is_default)).slice(0, 4).map((i) => i.src);
  },

  async handleWebhook(req) {
    const secret = webhookSecret(WEBHOOK_SECRET_ENV);
    const sig = req.headers.get("x-pfy-signature") ?? "";
    const expected = `sha256=${hmacSha256Hex(secret, req.rawBody)}`;
    if (!sig || !safeEqual(sig, expected)) throw new WebhookSignatureError();

    const body = JSON.parse(req.rawBody) as {
      id: string;
      type: string;
      created_at?: string;
      resource?: {
        id: string;
        data?: {
          status?: string;
          carrier?: { code?: string; tracking_number?: string; tracking_url?: string };
          shipped_at?: string;
          delivered_at?: string;
        };
      };
    };
    const orderId = body.resource?.id;
    if (!orderId) return [];
    const data = body.resource?.data ?? {};
    const tracking = data.carrier
      ? { carrier: data.carrier.code, number: data.carrier.tracking_number, url: data.carrier.tracking_url }
      : undefined;
    let status: FulfillmentStatus | undefined;
    if (body.type === "order:shipment:delivered") status = "DELIVERED";
    else if (body.type === "order:shipment:created") status = "SHIPPED";
    else if (body.type === "order:updated" || body.type === "order:sent-to-production") status = mapStatus(data.status);
    const update: PartnerUpdate = {
      eventId: eventId("printify", body.id),
      partnerOrderId: String(orderId),
      status,
      tracking,
      failureReason: data.status === "had-issues" ? "Printify reported a problem with this order" : null,
      occurredAt: body.created_at ? new Date(body.created_at) : new Date(),
    };
    mock.remember(update);
    return [update];
  },

  buildMockWebhook(partnerOrderId, status, tracking) {
    const t = mockTracking(status, tracking);
    const type =
      status === "DELIVERED" ? "order:shipment:delivered" : status === "SHIPPED" ? "order:shipment:created" : "order:updated";
    const printifyStatus: Record<string, string> = {
      SUBMITTED: "pending",
      IN_PRODUCTION: "in-production",
      SHIPPED: "fulfilled",
      DELIVERED: "fulfilled",
      FAILED: "had-issues",
      CANCELED: "canceled",
      PENDING: "pending",
    };
    const rawBody = JSON.stringify({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      created_at: new Date().toISOString(),
      resource: {
        id: partnerOrderId,
        type: "order",
        data: {
          status: printifyStatus[status],
          carrier: t ? { code: t.carrier, tracking_number: t.number, tracking_url: t.url } : undefined,
        },
      },
    });
    const headers = new Headers({
      "x-pfy-signature": `sha256=${hmacSha256Hex(webhookSecret(WEBHOOK_SECRET_ENV), rawBody)}`,
    });
    return { headers, rawBody, query: new URLSearchParams() };
  },
};

export default printify;
