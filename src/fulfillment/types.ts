/**
 * The contract every fulfillment partner implements.
 *
 * To add a partner, create ONE file in src/fulfillment/adapters/ that
 * default-exports a FulfillmentProvider. `npm run gen` (run automatically by
 * dev/build/test) adds it to the registry; the connect page, listing wizard,
 * checkout quotes, order submission and webhook route all pick it up.
 */

export type FulfillmentStatus =
  | "PENDING"
  | "SUBMITTED"
  | "IN_PRODUCTION"
  | "SHIPPED"
  | "DELIVERED"
  | "FAILED"
  | "CANCELED";

export type ProviderKind = "pod" | "self" | "digital";

export interface CredentialField {
  key: string;
  label: string;
  help?: string;
  secret?: boolean;
  optional?: boolean;
}

export interface ProviderAuth {
  type: "API_KEY" | "OAUTH" | "NONE";
  fields?: CredentialField[];
  /** OAuth is offered only when the platform app keys are configured. */
  oauth?: {
    enabledEnv: string[];
    authorizeUrl: (state: string, redirectUri: string) => string;
    exchangeCode: (code: string, redirectUri: string) => Promise<Record<string, string>>;
  };
  /** Where sellers create the key, shown on the connect form. */
  keyHelpUrl?: string;
}

/** Everything an adapter needs to act for one seller. */
export interface ProviderContext {
  credentials: Record<string, string> | null;
  /** When true, no network calls are made. */
  mock: boolean;
  externalShopId?: string | null;
  connectionId?: string | null;
  /** Public base URL, for webhook registration and file links. */
  appUrl: string;
}

export interface CatalogVariant {
  id: string;
  name: string;
  baseCostCents: number;
  color?: string;
  size?: string;
}

export interface CatalogProduct {
  /** Partner's product id (Printify blueprint, Printful product, Gelato product UID…). */
  id: string;
  /** One of the canonical ids in src/config/catalog.ts. */
  productType: string;
  name: string;
  description?: string;
  baseCostCents: number;
  /** Typical shipping the partner charges for one unit to the US. */
  typicalShippingCents: number;
  variants: CatalogVariant[];
  mockupSupported: boolean;
  /** Adapter-specific data stored on the listing (print provider id, placement, …). */
  data?: Record<string, unknown>;
}

export interface ShipTo {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
  email?: string | null;
  phone?: string | null;
}

export interface QuoteItem {
  partnerProductId: string | null;
  partnerVariantId: string | null;
  quantity: number;
  baseCostCents: number;
  partnerData?: Record<string, unknown> | null;
  /** Seller-set flat rate (self-ship only). */
  flatShippingCents?: number | null;
}

export interface Quote {
  productionCents: number;
  shippingCents: number;
  currency: string;
  minDays: number;
  maxDays: number;
  methodId?: string;
}

export interface PartnerOrderItem {
  partnerProductId: string | null;
  partnerVariantId: string | null;
  quantity: number;
  designUrl?: string | null;
  partnerData?: Record<string, unknown> | null;
  title: string;
}

export interface PartnerOrderInput {
  /** Our Fulfillment id, sent as the partner's external/reference id. */
  externalId: string;
  shipTo: ShipTo | null;
  items: PartnerOrderItem[];
  shippingMethodId?: string;
}

export interface Tracking {
  carrier?: string | null;
  number?: string | null;
  url?: string | null;
}

export interface PartnerOrderResult {
  partnerOrderId: string;
  status: FulfillmentStatus;
  raw?: unknown;
}

export interface PartnerStatus {
  status: FulfillmentStatus;
  tracking?: Tracking;
  deliveredAt?: Date | null;
  failureReason?: string | null;
  raw?: unknown;
}

/** A normalised update parsed from a partner webhook. */
export interface PartnerUpdate {
  eventId: string;
  partnerOrderId: string;
  status?: FulfillmentStatus;
  tracking?: Tracking;
  failureReason?: string | null;
  occurredAt?: Date;
}

export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
  query: URLSearchParams;
}

export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export class PartnerApiError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(`${provider} API ${status}: ${message}`);
    this.name = "PartnerApiError";
  }
}

export interface FulfillmentProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  tagline: string;
  website?: string;
  auth: ProviderAuth;
  capabilities: {
    mockups: boolean;
    webhooks: boolean;
    /** Who supplies tracking numbers. */
    tracking: "partner" | "seller" | "none";
  };
  /** Product types this partner can make (canonical ids). */
  productTypes: string[];

  /** Check credentials when a seller connects; returns a label like the shop name. */
  verifyConnection(ctx: ProviderContext): Promise<{ accountLabel: string; externalShopId?: string | null }>;
  /** Optional: register webhooks for this seller's account after connecting. */
  registerWebhooks?(ctx: ProviderContext, webhookUrl: string): Promise<void>;

  listCatalog(ctx: ProviderContext): Promise<CatalogProduct[]>;
  getQuote(ctx: ProviderContext, items: QuoteItem[], shipTo: ShipTo | null): Promise<Quote>;
  createOrder(ctx: ProviderContext, order: PartnerOrderInput): Promise<PartnerOrderResult>;
  getStatus(ctx: ProviderContext, partnerOrderId: string): Promise<PartnerStatus>;
  cancel(ctx: ProviderContext, partnerOrderId: string): Promise<{ canceled: boolean; reason?: string }>;
  /** Partner-rendered product photos, when the partner has a mockup API. */
  createMockups?(
    ctx: ProviderContext,
    input: { partnerProductId: string; partnerVariantIds: string[]; designUrl: string; partnerData?: Record<string, unknown> | null },
  ): Promise<string[] | null>;

  /** Verify and parse an incoming webhook. Throws WebhookSignatureError when not authentic. */
  handleWebhook(req: WebhookRequest): Promise<PartnerUpdate[]>;
  /** Mock mode only: build a signed webhook request so the full pipeline can be demoed and tested. */
  buildMockWebhook?(partnerOrderId: string, status: FulfillmentStatus, tracking?: Tracking): WebhookRequest;
}
