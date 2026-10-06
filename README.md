# Synthora

A marketplace for AI-made products. Sellers list things made with AI (prints, apparel, homeware, stickers, embroidered patches, digital files); every listing names the AI tool and says how it was made. Buyers pay the platform; the platform keeps an 8% commission, passes card processing through at cost, holds the seller's money until delivery, then pays the seller through Stripe Connect. Sellers pay $3/month.

Each listing can use a different fulfillment partner: **Printify**, **Printful**, **Gelato**, **"I ship it myself"**, or **digital delivery**. Sellers connect their own partner accounts; partners bill the seller directly.

Everything runs with **zero API keys** in demo mode: payments, partners, image generation, copywriting, email and file storage all have working mocks.

- Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · Postgres + Prisma 6 · Auth.js v5 · Stripe Connect + Billing · S3-compatible storage
- Deploy target: Vercel + Supabase
- Product requirements: [docs/PRD.md](docs/PRD.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Design brief: [docs/DESIGN.md](docs/DESIGN.md)
- Launch readiness, requirement by requirement: [docs/READINESS.md](docs/READINESS.md) · Metric definitions: [docs/METRICS.md](docs/METRICS.md) · October 2026 product review: [docs/reviews/2026-10-05-complete-review.md](docs/reviews/2026-10-05-complete-review.md)

**Status:** not launched. No real customers, revenue or production traffic. Live mode refuses to start until the launch gates in [src/config/launch.ts](src/config/launch.ts) are signed off (tax, territory, legal review, refund and reserve policy, support and reconciliation owners).

---

## Run it locally (no keys needed)

Requirements: Node 20.9+ (22 recommended) and Postgres 16 (Docker or a local install).

```bash
npm install
npm run setup               # writes .env with generated secrets (never overwrites)
docker compose up -d        # Postgres on :5432 (skip if you run Postgres yourself)
npm run db:migrate          # create tables
npm run db:seed             # demo shops, listings and orders in every state
npm run dev                 # http://localhost:3000
```

Demo accounts (all use the password `synthora-demo`, set in `prisma/seed.ts`; seed refuses to run in production):

| Email | What it shows |
| --- | --- |
| `admin@synthora.market` | Admin area: review queue, action queue, reconciliation, approvals, reports, refunds, ledger, outbox. Outside demo mode it asks you to set up an authenticator app on first visit. |
| `buyer@example.com` | Buyer with delivered, in-progress, refunded and failed orders |
| `nightshift@example.com` | Seller using Printful + Printify (demo connections) |
| `geometry@example.com` | Seller using Gelato + digital files |
| `patches@example.com` | Seller who ships embroidered patches themselves |
| `newshop@example.com` | Seller waiting for approval |

Verification and password-reset emails are not sent in demo mode; open them in Admin → Email outbox.

### Things to try in demo mode

- **Buy something.** Add items from two shops to the cart, check out, and pay on the simulated Stripe page. The order is split per seller, partner orders are created, and digital files are downloadable straight away.
- **Make a listing with AI.** Sign in as a seller → *New listing* → *Make one with AI*. The demo generator (procedural art, not an AI model) draws four designs from your words, shows a mockup, drafts the copy, and shows live earnings math. Submitting runs the file checks; the listing then waits in Admin → *Review queue* until someone approves it.
- **Move an order along.** On a seller order using a demo partner connection, use the *simulate a webhook* buttons (in production → shipped → delivered). These go through the real webhook parser and signature checks.
- **See a partner failure.** Check out with an address line containing the word `Fail`. The partner rejects it, the seller gets an "Action needed" flag, and the buyer is emailed (see Admin → Email outbox).
- **Lapse a subscription.** Seller → *Earnings & billing* → *Manage billing* → *Simulate a failed renewal*. Listings pause (not delete); paying restores them.
- **Release payouts.** Buyer confirms delivery on the order page (or wait out the hold window), then Admin → *Run payout release now*.
- **Check the books.** Admin → *Reconciliation* → *Run now* compares every paid order with the ledger (and with Stripe when it is configured). Admin → *Action queue* lists anything that failed or could not be confirmed, with an owner.

### Using real Stripe in test mode (locally)

Demo mode fakes Stripe. To try the real thing with test cards:

1. In the Stripe Dashboard (test mode), turn on **Connect** (Connect → Get started → Platform/marketplace, Express accounts). Without this, seller payout setup fails.
2. Copy your **secret** key (Developers → API keys → `sk_test_…`, or a restricted `rk_test_…` key with write access) into `.env` as `STRIPE_SECRET_KEY`. The publishable key (`pk_test_…`) isn't needed: buyers pay on Stripe Checkout.
3. Forward webhooks to your computer. Once: `stripe login`. Then, in a second terminal while `npm run dev` runs:
   ```bash
   npm run stripe:listen
   ```
   It prints a signing secret (`whsec_…`). Put it in `.env` as `STRIPE_WEBHOOK_SECRET`, then restart `npm run dev`.
4. Sign up as a **new** seller and go through Stripe's onboarding with its test data (SSN `000-00-0000`, routing `110000000`, account `000123456789`). The seeded demo sellers have fake Stripe accounts, so payouts to them will fail. New shops start as *pending*: approve them as `admin@synthora.market` in Admin → Sellers.
5. Buy with card `4242 4242 4242 4242`, any future date, any CVC.

With a Stripe key set the app runs in **test mode** (`APP_MODE` blank or `test`): the banner says "Test mode", the `/mock/stripe` pages turn off, new shops start *pending*, and admin pages require a second factor. A live key (`sk_live_`/`rk_live_`) is refused unless `APP_MODE=live`. Remove the key to go back to demo mode.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (regenerates adapter registries first) |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Vitest, 119 tests: fee math, adapter contract, webhooks, identity, files and review, money under crashes and races, live-mode safety, AI budgets (uses database `synthora_test`) |
| `npm run e2e` | Playwright browser tests in your installed Chrome against an isolated, fully simulated copy on port 3100 (its own database `synthora_e2e`) |
| `npm run typecheck` | TypeScript |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production (`prisma migrate deploy`) |
| `npm run db:seed` | Wipe and load demo data (dev only) |
| `npm run gen` | Rebuild the adapter registries from `src/fulfillment/adapters` and `src/ai/*` |
| `npm run stripe:listen` | Forward Stripe test-mode webhooks to localhost (needs the Stripe CLI and `stripe login`) |
| `npm run admin:grant -- you@example.com` | Make a confirmed account an admin (the only way to grant admin) |
| `npm run admin:revoke -- you@example.com` / `admin:reset-2fa -- …` | Remove admin / clear a lost authenticator |
| `npm run secrets:reencrypt` | Re-encrypt stored secrets after rotating `ENCRYPTION_KEY` |
| `npm run backup:check` | Dump the database, restore it into a scratch database and compare row counts and the ledger total |

Tests need the `synthora_test` database. Docker Compose creates it; with your own Postgres run `createdb -O synthora synthora_test`, or set `DATABASE_URL_TEST`.

## Where things live

```
src/config/fees.ts            every fee, rate and hold window (one file, versioned)
src/config/launch.ts          what is switched on, where we sell, AI limits, launch gates
src/config/licenses.ts        licence texts for digital files (versioned)
src/config/catalog.ts         product types, categories, AI tool list
src/lib/fees.ts               pure fee + payout math (tested)
src/fulfillment/types.ts      the FulfillmentProvider interface
src/fulfillment/adapters/     printify.ts printful.ts gelato.ts self.ts digital.ts
src/ai/                       image models (openai, mock) and copywriters (anthropic, mock)
src/lib/payments/             Stripe gateway + mock gateway behind one interface
src/server/                   domain logic: checkout, orders, fulfillment, payouts, refunds, sellers, trust,
                              assets (files), listings + listing-checks (review), operations + jobs
                              (durable effects), reconcile, identity (verification, 2FA), usage (AI budget)
src/app/                      pages (buyer, /seller, /admin, /legal) and API routes
src/components/mockup/        the SVG product mockup renderer
prisma/schema.prisma          data model; prisma/seed.ts demo data
tests/                        Vitest suites
e2e/                          Playwright browser tests
```

## Changing fees

Edit [src/config/fees.ts](src/config/fees.ts). Checkout, payouts, the seller calculator, the pricing page, legal copy and tests all read from it. If you change the $3 plan and use a fixed Stripe Price, also update `STRIPE_SUBSCRIPTION_PRICE_ID`.

## Adding a fulfillment partner

Create one file, `src/fulfillment/adapters/<partner>.ts`, that default-exports a `FulfillmentProvider` (see [src/fulfillment/types.ts](src/fulfillment/types.ts) and any existing adapter). That's all: `npm run gen` (run automatically by dev/build/test) adds it to the registry, and it appears on the partners page, in the listing wizard, in checkout quotes, order submission, the webhook route `/api/webhooks/fulfillment/<id>`, and the contract test suite. Add a `<PARTNER>_WEBHOOK_SECRET` env var if it receives webhooks.

---

## Go-live checklist

Do these in order. Test everything with Stripe **test mode** keys first, then repeat the Stripe steps with live keys.

### 1. Database (Supabase)
1. Create a Supabase project in the region you'll deploy Vercel functions to.
2. Settings → Database → Connection string:
   - `DATABASE_URL` = the **pooled** (Transaction, port 6543) URL with `?pgbouncer=true&connection_limit=1` appended.
   - `DIRECT_URL` = the **direct** (port 5432) URL. Migrations use this.
3. Migrations run automatically on each Vercel deploy (`vercel-build` runs `prisma migrate deploy`). To run them by hand: `DATABASE_URL=… DIRECT_URL=… npm run db:deploy`.
4. Never run `db:seed` against production.

### 2. File storage (Supabase Storage, or R2/S3)
1. Create two buckets: `public` (Public bucket on) for photos and reduced previews, and `private` (Public off) for design originals, digital products and the upload quarantine. The private bucket is required; private files never fall back to the public one. Add a lifecycle rule that deletes `quarantine/` objects after a day.
2. Storage → S3 Connection → create an access key. Set:
   - `S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3`
   - `S3_REGION` = your project region (e.g. `us-east-1`)
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - `S3_PUBLIC_BUCKET=public`, `S3_PRIVATE_BUCKET=private`
   - `S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/public`
   - `S3_FORCE_PATH_STYLE=true`
3. Allow browser uploads: add a CORS rule on the **private** bucket permitting `PUT` from your domain (sellers upload into quarantine with presigned URLs; the server checks the bytes before anything is used).
4. After deploying, Admin → Readiness → *Test bucket policies* must report the private bucket refuses unsigned reads.

### 3. Secrets
Generate and set: `AUTH_SECRET` (`openssl rand -base64 32`), `ENCRYPTION_KEY` (32 random bytes, base64; **back it up**, partner keys can't be decrypted without it), `CRON_SECRET`, `PRINTIFY_WEBHOOK_SECRET`, `PRINTFUL_WEBHOOK_SECRET`, `GELATO_WEBHOOK_SECRET`. `npm run setup` prints a fresh set into `.env` you can copy from. Leave `MOCK_MODE=false`. Set `APP_MODE=test` until launch, `live` only when Admin → Readiness is all green.

Admins: sign up with your email, confirm it, then run `npm run admin:grant -- you@example.com` against the production database. You'll set up an authenticator app on your first visit to `/admin`. `ALERT_EMAILS` only adds addresses that receive alerts; it grants nothing.

### 4. Stripe
1. Activate your Stripe account; set business name, support email, statement descriptor ("SYNTHORA").
2. **Connect**: Dashboard → Connect → get started → choose **Platform/marketplace**, **Express** accounts, and the "Separate charges and transfers" funds flow. Fill in the platform profile and branding (shown during seller onboarding). Make sure your platform is allowed to onboard sellers in the countries you'll support.
3. **Billing**: optionally create a Product "Synthora seller plan" with a recurring **$3.00/month** price and set `STRIPE_SUBSCRIPTION_PRICE_ID` (otherwise Checkout creates the price inline). Settings → Billing → Customer portal: enable updating payment methods and canceling.
4. **Webhooks** (Developers → Webhooks). Set the endpoint API version to `2026-09-30.endive` (the version this SDK uses).
   - Endpoint A, *your account*: `https://<domain>/api/webhooks/stripe`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy its signing secret to `STRIPE_WEBHOOK_SECRET`.
   - Endpoint B, *connected accounts*: same URL, event `account.updated`. Copy its signing secret to `STRIPE_CONNECT_WEBHOOK_SECRET`.
5. Set `STRIPE_SECRET_KEY` (`sk_test_…` first, `sk_live_…` at launch). No publishable key is needed: buyers pay on Stripe Checkout.
6. Payouts to your own bank: Settings → Payouts. Keep enough balance for transfers (separate charges and transfers draw from your platform balance; transfers use `source_transaction` so they don't wait for funds to settle).

### 5. Fulfillment partners
Sellers connect **their own** accounts; the platform needs only webhook secrets.
- **Printify**: nothing else. Webhooks are registered automatically per shop when a seller connects, signed with `PRINTIFY_WEBHOOK_SECRET`.
- **Printful**: webhooks are registered automatically on connect. Optional OAuth ("Sign in with Printful"): create an app at developers.printful.com with redirect URL `https://<domain>/api/partners/oauth/printful`, then set `PRINTFUL_CLIENT_ID` and `PRINTFUL_CLIENT_SECRET`.
- **Gelato**: each seller pastes the per-account webhook URL shown on their partners page into Gelato → Developer → Webhooks.
- Base costs in the curated catalogs (`src/fulfillment/adapters/*.ts`) are typical prices; review them and the product/variant IDs against each partner's current catalog before launch.

### 6. AI
- `OPENAI_API_KEY` (and optionally `OPENAI_IMAGE_MODEL`, default `gpt-image-1`) for "Make one with AI". Originals are stored privately; only 800 px previews are public. In live mode the studio is off without a real image model.
- Limits, the platform's daily AI budget and the per-image cost estimate are in `src/config/launch.ts`; set the estimate from your provider's current prices. `AI_STUDIO_ENABLED=false` stops all generation at once.
- gpt-image-1 returns at most 1536 px. The listing checks block print sizes below 100 DPI, so large posters and full-size shirt prints from raw model output will not pass without upscaling or a smaller print size.
- `ANTHROPIC_API_KEY` for listing copy. Uses Claude Opus 5.5 at low effort with structured output and server-side refusal fallback; falls back to the template writer on any error.

### 7. Email
Create a Resend account, verify your sending domain, set `RESEND_API_KEY` and `EMAIL_FROM`. Every email is also recorded in Admin → Email outbox.

### 8. Sign-in
Email + password works out of the box. Optional Google: create OAuth credentials with redirect `https://<domain>/api/auth/callback/google`, set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`.

### 9. Vercel
1. Push this folder to a Git repo and import it in Vercel (framework: Next.js; build uses `vercel-build` automatically).
2. Add every environment variable above to Production (and Preview if you use it, with test keys).
3. Set the function region close to your Supabase region.
4. Cron jobs come from `vercel.json`: background jobs and recovery every 5 minutes (`/api/cron/run-jobs`), reconciliation daily at 12:00 UTC, payouts daily at 14:00 UTC, partner status sync hourly. Vercel sends `CRON_SECRET` automatically. Sub-daily cron needs Vercel Pro. Elsewhere, have any scheduler call those URLs with `Authorization: Bearer $CRON_SECRET`.

### 10. Domain
1. Add your domain in Vercel → Domains and set the DNS records it shows.
2. Set `APP_URL=https://<domain>` and redeploy.
3. Update the Stripe webhook URLs, the Printful OAuth redirect, the Google redirect and Resend's domain to the final domain.

### 11. Before opening the doors
- [ ] Legal review of `/legal/*` and the licence texts in `src/config/licenses.ts`. Copy lives in `src/content/legal.tsx`.
- [ ] Decide on sales tax (Stripe Tax or a marketplace-facilitator setup), legal review and seller reserves; record each in `LAUNCH.gates` (src/config/launch.ts). Territory (US only), refund policy and the support and reconciliation owners are recorded. Live mode will not start until every gate is filled.
- [ ] Admin → Readiness shows no blocking checks on the production deployment; every admin has two-step sign-in.
- [ ] Run `npm run backup:check` against production (read-only on the source) and keep the dump.
- [ ] Sign up as a seller with a real Stripe Express account in test mode; connect a real partner account; publish; buy it with card `4242 4242 4242 4242`; check the partner order, then refund it from Admin.
- [ ] Switch Stripe to live keys and webhooks; make one real purchase and refund it.
- [ ] Confirm `/mock/*` pages 404 (they only exist while Stripe is unconfigured or `MOCK_MODE=true`).
- [ ] Approve your first sellers in Admin → Sellers (new shops start as *pending* when Stripe is live).

---

## What's real and what's mocked

| Area | Real implementation | Mock (demo mode) |
| --- | --- | --- |
| Payments | Stripe Checkout, Connect Express, separate charges & transfers, refunds, transfer reversals, disputes, Billing | Simulated Stripe pages that call the same handlers as the webhooks |
| Partners | Printify, Printful, Gelato REST calls (orders, quotes, status, cancel, catalog, mockups, webhooks) written against their public APIs | In-memory partner backend; signed mock webhooks through the real parsers |
| Image model | OpenAI Images (`gpt-image-1`) | Procedural SVG artwork from the prompt |
| Copywriting | Claude (Opus 5.5) with structured output | Template writer |
| Storage | S3-compatible (Supabase, R2, S3) with presigned uploads and signed downloads | Local disk under `.data/storage` |
| Email | Resend | Stored in the admin outbox |

The partner adapters were written against each partner's documented API but have only been exercised with stubbed responses in tests, since no partner keys were available. Treat the first real order with each partner as a test.

## Known limitations

- No malware scanner is attached to uploads. Files are format-checked, SVGs must be inert, zips cannot contain programs, and photos are re-encoded; a real scanner plugs into `scanForThreats` in `src/server/assets.ts`.
- Printify cannot look orders up by our reference, so a Printify order whose result was lost goes to the action queue for a person instead of recovering on its own (Printful and Gelato recover automatically).
- Reconciliation against Stripe is skipped for demo orders (there is nothing at Stripe to compare).
- Self-shipped parcels don't get carrier delivery scans (no tracking API connected), so they release on buyer confirmation or 30 days after shipping.
- Single currency (USD).
- Sales tax is not calculated.
