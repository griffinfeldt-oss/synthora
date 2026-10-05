/**
 * Every fulfillment adapter must satisfy the same contract. New adapters are
 * picked up from the generated registry, so they are tested automatically.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_PROVIDERS } from "@/fulfillment/registry.generated";
import { WebhookSignatureError, type FulfillmentStatus, type ProviderContext } from "@/fulfillment/types";
import { PRODUCT_TYPES } from "@/config/catalog";

const STATUSES: FulfillmentStatus[] = ["PENDING", "SUBMITTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "FAILED", "CANCELED"];
const ctx: ProviderContext = { credentials: null, mock: true, appUrl: "http://localhost:3000" };
const shipTo = { name: "Ada Lovelace", line1: "1 Analytical Way", city: "Austin", state: "TX", postalCode: "78701", country: "US", email: "ada@test.local" };

describe.each(ALL_PROVIDERS.map((p) => [p.id, p] as const))("adapter: %s", (_id, provider) => {
  it("declares metadata", () => {
    expect(provider.id).toMatch(/^[a-z0-9-]+$/);
    expect(provider.name.length).toBeGreaterThan(1);
    expect(["pod", "self", "digital"]).toContain(provider.kind);
    expect(["API_KEY", "OAUTH", "NONE"]).toContain(provider.auth.type);
    if (provider.kind === "pod") expect(provider.auth.fields?.length).toBeGreaterThan(0);
    for (const t of provider.productTypes) expect(PRODUCT_TYPES.map((p) => p.id)).toContain(t);
  });

  it("verifyConnection() returns an account label", async () => {
    const res = await provider.verifyConnection(ctx);
    expect(typeof res.accountLabel).toBe("string");
  });

  it("listCatalog() returns well-formed products for its product types", async () => {
    const catalog = await provider.listCatalog(ctx);
    expect(catalog.length).toBeGreaterThan(0);
    for (const p of catalog) {
      expect(typeof p.id).toBe("string");
      expect(provider.productTypes).toContain(p.productType);
      expect(Number.isInteger(p.baseCostCents)).toBe(true);
      expect(Number.isInteger(p.typicalShippingCents)).toBe(true);
      expect(p.variants.length).toBeGreaterThan(0);
      for (const v of p.variants) {
        expect(typeof v.id).toBe("string");
        expect(Number.isInteger(v.baseCostCents)).toBe(true);
        expect(v.baseCostCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("getQuote(product, shipTo) returns non-negative integer cents", async () => {
    const [p] = await provider.listCatalog(ctx);
    for (const dest of [shipTo, { ...shipTo, country: "GB", state: null }, null]) {
      const q = await provider.getQuote(
        ctx,
        [{ partnerProductId: p.id, partnerVariantId: p.variants[0].id, quantity: 2, baseCostCents: p.variants[0].baseCostCents, partnerData: p.data ?? null, flatShippingCents: 450 }],
        dest,
      );
      expect(Number.isInteger(q.shippingCents)).toBe(true);
      expect(q.shippingCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(q.productionCents)).toBe(true);
      expect(q.maxDays).toBeGreaterThanOrEqual(q.minDays);
    }
  });

  it("createOrder → getStatus → cancel", async () => {
    const [p] = await provider.listCatalog(ctx);
    const order = await provider.createOrder(ctx, {
      externalId: "ful_test_1",
      shipTo: provider.kind === "digital" ? null : shipTo,
      items: [{ partnerProductId: p.id, partnerVariantId: p.variants[0].id, quantity: 1, designUrl: "http://localhost:3000/design.png", partnerData: p.data ?? null, title: "Test" }],
    });
    expect(order.partnerOrderId.length).toBeGreaterThan(0);
    expect(STATUSES).toContain(order.status);
    const status = await provider.getStatus(ctx, order.partnerOrderId);
    expect(STATUSES).toContain(status.status);
    const c = await provider.cancel(ctx, order.partnerOrderId);
    expect(typeof c.canceled).toBe("boolean");
  });

  if (provider.capabilities.webhooks) {
    it("handleWebhook() accepts its own signed payloads and normalises them", async () => {
      expect(provider.buildMockWebhook).toBeTypeOf("function");
      for (const status of ["IN_PRODUCTION", "SHIPPED", "DELIVERED", "FAILED"] as const) {
        const req = provider.buildMockWebhook!("po_123", status);
        const updates = await provider.handleWebhook(req);
        expect(updates).toHaveLength(1);
        expect(updates[0].partnerOrderId).toBe("po_123");
        expect(updates[0].status).toBe(status);
        expect(updates[0].eventId.length).toBeGreaterThan(0);
        if (status === "SHIPPED") expect(updates[0].tracking?.number).toBeTruthy();
      }
    });

    it("handleWebhook() rejects tampered or unsigned payloads", async () => {
      const req = provider.buildMockWebhook!("po_123", "SHIPPED");
      const tampered = { ...req, rawBody: req.rawBody.replace("po_123", "po_999") };
      const unsigned = { headers: new Headers(), rawBody: req.rawBody, query: new URLSearchParams() };
      const verifiesBody = req.headers.has("x-pfy-signature");
      if (verifiesBody) await expect(provider.handleWebhook(tampered)).rejects.toBeInstanceOf(WebhookSignatureError);
      await expect(provider.handleWebhook(unsigned)).rejects.toBeInstanceOf(WebhookSignatureError);
    });
  } else {
    it("has no webhooks and ignores them safely", async () => {
      expect(await provider.handleWebhook({ headers: new Headers(), rawBody: "{}", query: new URLSearchParams() })).toEqual([]);
    });
  }
});

describe("live mode request shapes (fetch stubbed)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(response: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    return calls;
  }

  const live = (credentials: Record<string, string>, externalShopId?: string): ProviderContext => ({ credentials, mock: false, externalShopId, appUrl: "https://synthora.market" });
  const item = (id: string, variant: string, data: Record<string, unknown> = {}) => ({ partnerProductId: id, partnerVariantId: variant, quantity: 1, designUrl: "https://cdn.test/d.png", partnerData: data, title: "Tee" });

  it("Printify: creates the order in the seller's shop and sends it to production", async () => {
    const calls = stubFetch({ id: "pf-order-1" });
    const printify = ALL_PROVIDERS.find((p) => p.id === "printify")!;
    const res = await printify.createOrder(live({ apiToken: "tok" }, "shop-9"), { externalId: "ful_1", shipTo, items: [item("6", "12100", { blueprintId: 6, printProviderId: 99 })] });
    expect(res.partnerOrderId).toBe("pf-order-1");
    expect(calls[0].url).toBe("https://api.printify.com/v1/shops/shop-9/orders.json");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer tok");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.external_id).toBe("ful_1");
    expect(body.line_items[0]).toMatchObject({ blueprint_id: 6, print_provider_id: 99, variant_id: 12100, quantity: 1 });
    expect(calls[1].url).toBe("https://api.printify.com/v1/shops/shop-9/orders/pf-order-1/send_to_production.json");
  });

  it("Printful: posts a confirmed order with the print file", async () => {
    const calls = stubFetch({ code: 200, result: { id: 777, status: "pending" } });
    const printful = ALL_PROVIDERS.find((p) => p.id === "printful")!;
    const res = await printful.createOrder(live({ apiToken: "pk" }), { externalId: "ful_2", shipTo, items: [item("71", "4012", { placement: "front" })] });
    expect(res.partnerOrderId).toBe("777");
    expect(calls[0].url).toBe("https://api.printful.com/orders?confirm=true");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.recipient.country_code).toBe("US");
    expect(body.items[0]).toMatchObject({ variant_id: 4012, files: [{ type: "front", url: "https://cdn.test/d.png" }] });
  });

  it("Gelato: uses the API key header and product UID", async () => {
    const calls = stubFetch({ id: "gel-1", fulfillmentStatus: "created" });
    const gelato = ALL_PROVIDERS.find((p) => p.id === "gelato")!;
    const res = await gelato.createOrder(live({ apiKey: "gk" }), { externalId: "ful_3", shipTo, items: [item("mug_product", "mug_product_uid")] });
    expect(res.partnerOrderId).toBe("gel-1");
    expect(calls[0].url).toBe("https://order.gelatoapis.com/v4/orders");
    expect(new Headers(calls[0].init.headers).get("x-api-key")).toBe("gk");
    expect(JSON.parse(String(calls[0].init.body)).items[0].productUid).toBe("mug_product_uid");
  });

  it("surfaces partner API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Insufficient balance" }), { status: 402 })));
    const printify = ALL_PROVIDERS.find((p) => p.id === "printify")!;
    await expect(printify.createOrder(live({ apiToken: "t" }, "s"), { externalId: "x", shipTo, items: [item("6", "1", { blueprintId: 6, printProviderId: 99 })] })).rejects.toThrow(/Insufficient balance/);
  });
});
