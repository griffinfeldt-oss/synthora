# Architecture

One Next.js app (App Router) on Vercel, one Postgres database (Supabase), one S3-compatible store. All business logic lives in `src/server/*` and is called from server components, server actions, and API routes. External services sit behind small interfaces with a mock implementation each.

```
             Buyer / Seller / Admin (browser)
                        │
        Next.js pages + server actions (src/app)
                        │
     ┌──────────── domain services (src/server) ────────────┐
     │ checkout · orders · fulfillment · payouts · refunds   │
     │ sellers (plan, Connect, partners) · listings · trust  │
     └───────┬──────────────┬──────────────┬─────────────────┘
             │              │              │
   PaymentGateway   FulfillmentProvider   ImageModel / Copywriter   Storage   Email
   (Stripe | mock)  (Printify, Printful,  (OpenAI | mock,          (S3 |     (Resend |
                     Gelato, self,         Claude | mock)           local)    outbox)
                     digital)
             │              │
   /api/webhooks/stripe   /api/webhooks/fulfillment/[provider]     /api/cron/*
```

## Money flow (separate charges and transfers)

1. **Checkout** (`server/checkout.ts`). The cart is re-priced on the server. Items are grouped by seller (→ `SellerOrder`, the unit of payout) and then by fulfillment connection (→ `Fulfillment`, one partner order). Each group's shipping comes from its adapter's `getQuote`. `lib/fees.splitOrder` computes commission and an estimated card fee per seller. The `Order` is saved as `PENDING_PAYMENT` and the buyer goes to Stripe Checkout (one charge for the whole cart, `transfer_group = orderId`).
2. **Paid** (`server/orders.markOrderPaid`, from `checkout.session.completed`). The order is claimed atomically (so duplicate webhooks do nothing), re-split using Stripe's **actual** fee from the balance transaction, and the ledger is written. Partner orders are then created through each listing's adapter.
3. **Hold.** `lib/fees.payoutReleaseDate` decides when each seller order may be paid: buyer confirmation, or `daysAfterDelivered` after the delivery scan, `digitalDays` after purchase for downloads, or `daysAfterShippedWithoutDelivery` as a safety net. Open disputes block release.
4. **Payout** (`server/payouts`, daily cron). Eligible seller orders are claimed, then `transfers.create` sends `netCents` to the seller's Express account with `source_transaction` set to the charge. Idempotency keys stop double transfers.
5. **Refunds** (`server/refunds`) are per seller order. Before payout we simply reduce the net; after payout we reverse the transfer. Commission is returned on refunds (config); Stripe's fee is not (passed through at cost). Lost disputes are accounted as refunds. Refunds made in the Stripe dashboard are synced from `charge.refunded`.
6. **Seller plan.** $3/month via Stripe Billing. `invoice.payment_failed` / non-active subscription statuses set listings to `PAUSED_BILLING`; paying sets them back to `ACTIVE`.

### Ledger
`LedgerEntry` is append-only. Each movement writes balanced rows across three accounts:

| Account | Meaning |
| --- | --- |
| `CASH` | the platform's Stripe balance (charges in; fees, transfers, refunds out) |
| `PLATFORM` | platform revenue (commission, plans, minus commission returned) |
| `SELLER` | owed to a seller; a seller order's `SELLER` rows always sum to its `netCents`, and to zero once paid |

Tests assert these invariants (`tests/webhooks.test.ts`).

## Fulfillment adapters

`src/fulfillment/types.ts` defines `FulfillmentProvider`:

| Method | Purpose |
| --- | --- |
| `verifyConnection(ctx)` | check a seller's key when they connect |
| `registerWebhooks?(ctx, url)` | subscribe to the partner's order events |
| `listCatalog(ctx)` | products, variants and base costs, mapped to our product types |
| `getQuote(ctx, items, shipTo)` | production + shipping cost and delivery window |
| `createOrder(ctx, order)` | place the order in the seller's partner account |
| `getStatus(ctx, id)` / `cancel(ctx, id)` | polling fallback and cancellation |
| `createMockups?(ctx, input)` | partner-rendered product photos |
| `handleWebhook(req)` | verify the signature and normalise to `PartnerUpdate[]` |
| `buildMockWebhook?(id, status)` | demo/test helper producing a correctly signed payload |

`ctx` carries the seller's decrypted credentials (`PartnerConnection.encryptedCredentials`, AES-256-GCM with `ENCRYPTION_KEY`) or `mock: true`. Adapters never touch the database, which keeps them testable and the contract uniform. `scripts/gen-registries.mjs` builds `registry.generated.ts` from the adapter folder, so a new partner is one file. `tests/adapters.contract.test.ts` runs every registered adapter through the same contract.

Webhook auth: Printify signs bodies (HMAC-SHA256); Printful v1 and Gelato don't, so their URLs carry a secret token. For Gelato, which each seller configures in their own dashboard, the URL is per connection (`?c=<connection>&sig=<hmac>`) and can only update that seller's orders. Incoming events are de-duplicated in `WebhookEvent`. An hourly cron polls `getStatus` for anything a webhook may have missed.

## AI listing studio

`/seller/listings/new/ai` → `server/studio.ts`:
1. `generateDesigns`: the first available `ImageModel` (OpenAI, else the procedural mock in `ai/art.ts`) makes four images, stored in the public bucket and recorded in `Generation` for provenance.
2. Mockups: partner mockup APIs when the connection is live (Printful mockup generator, Printify product images), otherwise `components/mockup/ProductMockup` renders a layered SVG scene.
3. `draftCopy`: Claude writes title, description, tags and a first-person "how it was made" note (structured output). Errors fall back to the template writer.
4. Pricing uses `lib/fees.previewEarnings`, the same math as checkout.
5. `createListing` validates disclosure fields, the rights confirmation, partner product and variants, and price against base cost.

## Visibility and moderation

A listing is public when `status = ACTIVE` and the seller is `APPROVED`. New shops start `PENDING` when Stripe is live (instantly approved in demo mode). Admins can approve or suspend sellers (suspension also blocks payouts) and suspend, remove or restore listings. Reports and IP notices are queued in the admin area; the takedown flow supports counter-notices. All admin actions write `AuditLog`.

## Security notes

- Card data never reaches the app (Stripe Checkout). Stripe webhooks are signature-checked; partner webhooks too.
- Partner credentials are encrypted at rest and never shown back or sent to the browser.
- Digital files sit in a private bucket and are only reachable through 5-minute signed links issued after an ownership check (signed-in buyer or the order's access token), with a download cap.
- Uploaded files are type/size checked and keyed under the seller's id; listing creation rejects images that are not the seller's own uploads or generations. SVG designs are served with a sandboxing CSP.
- Mock routes (`/mock/*`) return 404 once Stripe is configured. Mock partner webhooks only work on demo connections.
- Without secrets configured, production rejects webhooks instead of falling back to defaults.
- No secrets are committed: `.env` is git-ignored and `npm run setup` generates local ones.

## Mock mode

Each integration decides independently (`lib/env.ts`): no key → mock. `MOCK_MODE=true` forces everything into mock. The orange banner shows while Stripe is mocked. Because mocks call the same domain functions as real webhooks, demo mode exercises the full order, payout, refund and subscription logic.
