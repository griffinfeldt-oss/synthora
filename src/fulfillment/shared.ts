/**
 * Helpers shared by adapters: HTTP with errors, HMAC checks, the mock backend
 * used when a connection is in mock mode, and status mapping.
 */
import { createHmac, randomBytes } from "node:crypto";
import {
  PartnerApiError,
  WebhookSignatureError,
  type CatalogProduct,
  type FulfillmentStatus,
  type PartnerOrderInput,
  type PartnerOrderResult,
  type PartnerStatus,
  type PartnerUpdate,
  type Quote,
  type QuoteItem,
  type ShipTo,
  type Tracking,
  type WebhookRequest,
} from "./types";
import { safeEqual } from "@/lib/crypto";

export async function partnerFetch<T>(
  provider: string,
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  headers.set("User-Agent", "Synthora/1.0");
  const res = await fetch(url, { ...init, headers, body, cache: "no-store" });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && ("message" in data || "error" in data)
        ? String((data as Record<string, unknown>).message ?? JSON.stringify((data as Record<string, unknown>).error))
        : res.statusText) || "Request failed";
    throw new PartnerApiError(provider, res.status, message, data);
  }
  return data as T;
}

export function requireCredential(creds: Record<string, string> | null, key: string, provider: string): string {
  const v = creds?.[key];
  if (!v) throw new PartnerApiError(provider, 401, `Missing ${key}. Reconnect your ${provider} account.`);
  return v;
}

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * The shared secret for a partner's webhooks. Outside production a fixed dev
 * value is used so mock webhooks work; in production a missing secret rejects
 * every webhook rather than accepting a guessable one.
 */
export function webhookSecret(envName: string): string {
  const value = process.env[envName];
  if (value) return value;
  if (process.env.NODE_ENV === "production" && process.env.MOCK_MODE !== "true") {
    throw new WebhookSignatureError(`${envName} is not configured`);
  }
  return "dev-webhook-secret";
}

/** Verify a shared token sent as `?token=` on the webhook URL (partners that do not sign payloads). */
export function verifyQueryToken(req: WebhookRequest, envName: string): void {
  const expected = webhookSecret(envName);
  const got = req.query.get("token") ?? "";
  if (!got || !safeEqual(expected, got)) throw new WebhookSignatureError();
}

export function toCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function isDomestic(shipTo: ShipTo | null): boolean {
  return !shipTo || shipTo.country.toUpperCase() === "US";
}

// ─── Mock backend ────────────────────────────────────────────────────────────

interface MockOrder {
  id: string;
  externalId: string;
  status: FulfillmentStatus;
  tracking?: Tracking;
  createdAt: Date;
}

const mockOrders = new Map<string, MockOrder>();
const mockByExternal = new Map<string, string>();

/** Shared behaviour for adapters running without partner API keys. */
export function mockBackend(providerId: string, catalog: CatalogProduct[]) {
  return {
    listCatalog: async () => catalog,

    getQuote: async (items: QuoteItem[], shipTo: ShipTo | null): Promise<Quote> => {
      const productionCents = items.reduce((a, i) => a + i.baseCostCents * i.quantity, 0);
      let shippingCents = 0;
      items.forEach((item, idx) => {
        const product = catalog.find((p) => p.id === item.partnerProductId);
        const first = product?.typicalShippingCents ?? 475;
        // first unit full price, extra units ~40%
        const extra = Math.round(first * 0.4);
        shippingCents += (idx === 0 ? first : extra) + extra * Math.max(0, item.quantity - 1);
      });
      if (!isDomestic(shipTo)) shippingCents = Math.round(shippingCents * 2.2);
      return { productionCents, shippingCents, currency: "usd", minDays: 4, maxDays: isDomestic(shipTo) ? 9 : 18 };
    },

    createOrder: async (order: PartnerOrderInput): Promise<PartnerOrderResult> => {
      if (order.shipTo && /fail/i.test(order.shipTo.line1)) {
        // Lets the demo show the partner-failure path: use an address containing "fail".
        throw new Error(`${providerId} rejected the order: address could not be validated`);
      }
      // Like the real partners, one externalId makes one order.
      const existing = mockByExternal.get(`${providerId}:${order.externalId}`);
      if (existing) return { partnerOrderId: existing, status: mockOrders.get(existing)?.status ?? "SUBMITTED", raw: { mock: true, externalId: order.externalId } };
      const id = `mock_${providerId}_${randomBytes(5).toString("hex")}`;
      mockOrders.set(id, { id, externalId: order.externalId, status: "SUBMITTED", createdAt: new Date() });
      mockByExternal.set(`${providerId}:${order.externalId}`, id);
      return { partnerOrderId: id, status: "SUBMITTED", raw: { mock: true, externalId: order.externalId } };
    },

    findOrder: async (externalId: string): Promise<PartnerOrderResult | null> => {
      const id = mockByExternal.get(`${providerId}:${externalId}`);
      return id ? { partnerOrderId: id, status: mockOrders.get(id)?.status ?? "SUBMITTED" } : null;
    },

    getStatus: async (partnerOrderId: string): Promise<PartnerStatus> => {
      const o = mockOrders.get(partnerOrderId);
      return { status: o?.status ?? "SUBMITTED", tracking: o?.tracking };
    },

    cancel: async (partnerOrderId: string) => {
      const o = mockOrders.get(partnerOrderId);
      if (o && (o.status === "SHIPPED" || o.status === "DELIVERED")) {
        return { canceled: false, reason: "Already shipped" };
      }
      if (o) o.status = "CANCELED";
      return { canceled: true };
    },

    remember(update: PartnerUpdate) {
      const o = mockOrders.get(update.partnerOrderId);
      if (o && update.status) {
        o.status = update.status;
        if (update.tracking) o.tracking = update.tracking;
      }
    },
  };
}

export function mockTracking(status: FulfillmentStatus, tracking?: Tracking): Tracking | undefined {
  if (status !== "SHIPPED" && status !== "DELIVERED") return tracking;
  const number = tracking?.number ?? `9400${Math.floor(1e15 + Math.random() * 9e15)}`;
  return {
    carrier: tracking?.carrier ?? "USPS",
    number,
    url: tracking?.url ?? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`,
  };
}

export function eventId(provider: string, ...parts: Array<string | number | undefined | null>): string {
  return [provider, ...parts.filter((p) => p !== undefined && p !== null)].join(":");
}
