# Synthora — Product Requirements Document

| | |
| --- | --- |
| **Status** | v1 built and hardened after the October review; tested in the Stripe sandbox; not yet launched |
| **Last updated** | 5 October 2026 |
| **Related docs** | [README](../README.md) (setup + go-live checklist) · [Architecture](ARCHITECTURE.md) · [Design brief](DESIGN.md) · [Readiness matrix](READINESS.md) · [Metrics](METRICS.md) · [Complete review](reviews/2026-10-05-complete-review.md) |

---

## 1. Summary

Synthora is an online marketplace where every product is made with AI, and says so. Sellers turn a few words into a real product (a T-shirt, poster, mug, sticker, embroidered patch or digital file) and list it in minutes. Buyers see exactly which AI tool made each item and how.

Synthora sits in the middle of every sale. Buyers pay the platform. The platform keeps a commission, holds the seller's money until the order is delivered, then pays the seller. Production is handled by print-on-demand partners (Printify, Printful, Gelato) that each seller connects with their own account, or by the seller (self-ship), or not at all (digital downloads).

## 2. Problem

- **Buyers** increasingly can't tell what is AI-made, and many marketplaces hide it. People who are happy to buy AI art want honesty about it.
- **Makers** using AI have no marketplace built for them. General marketplaces are hostile to AI work or make sellers bury the disclosure, and setting up print-on-demand, payments and payouts is a lot of work for a hobbyist.
- **Listing is slow.** Going from an idea to a product page usually means generating art, preparing print files, making mockups, writing copy and doing margin math across several tools.

## 3. Goals and non-goals

### Goals
1. **Only AI-made products, honestly labelled.** Every listing names the AI tool and includes a "how it was made" note.
2. **Listing is extremely easy.** From idea to published listing in about two minutes with the AI studio.
3. **The platform is the merchant in the middle.** One checkout across many sellers, commission kept automatically, seller money held until delivery.
4. **Sellers choose their fulfillment per product,** using their own partner accounts so the platform never pays partner bills.
5. **Simple, predictable seller pricing:** $3/month + 8% per sale, card processing passed through at cost.
6. **Runs fully in demo mode with zero API keys,** so the product can be shown and tested end to end before any accounts exist.
7. **Money is never lost or double-moved.** Every payment, transfer and refund survives crashes and retries, and is reconciled against Stripe daily.
8. **Nothing goes live half-configured.** Live mode refuses to start until every real service is connected and every launch decision is signed off.

### Non-goals (v1)
- Non-AI or handmade-only products.
- Multiple currencies; selling outside the United States.
- Native mobile apps (the site is responsive down to 360px).
- Holding inventory or running a warehouse.
- Messaging between buyers and sellers (support is by email).
- Auctions, offers, coupons, or seller-run ads.

## 4. Users

| User | Who they are | What they need |
| --- | --- | --- |
| **Buyer** | Someone shopping for prints, apparel, gifts or digital art, comfortable with AI-made goods | Browse and search, trust that the AI disclosure is real, check out quickly (guest is fine), track orders, get help if something goes wrong |
| **Seller** | A hobbyist or small creator who makes designs with AI tools | A fast way to make and list products, clear earnings math, reliable payouts, no inventory, control over which partner makes each item |
| **Operator (admin)** | The marketplace owner (support and reconciliation: Griffin Feldt; backup: Grady) | Review every new listing and material edit, moderate shops, handle reports and IP notices, refund orders, work the action queue, run reconciliation, see fees and the money ledger |

## 5. Business model

All values live in one config file, [`src/config/fees.ts`](../src/config/fees.ts); checkout, payouts, the calculator, legal copy and tests read from it.

| Item | Value |
| --- | --- |
| Seller plan | **$3.00/month** (Stripe Billing). If a payment fails, listings **pause**, never delete; paying restores them. |
| Commission | **8%** of the item price. No commission on shipping. |
| Card processing | Stripe's actual fee (≈2.9% + 30¢), **passed through to the seller at cost**. In a multi-seller cart the fee is split by each seller's share of the charge. |
| Partner production | Billed by the partner **directly to the seller's own partner account**. The platform never pays partner bills. |
| Payout hold | Released when the buyer confirms delivery, or 7 days after tracking shows delivered; 3 days after purchase for digital; 30 days after shipping if no delivery scan arrives. |
| Refunds | Commission is returned on the refunded amount; Stripe does not return its fee, so the seller bears it (at cost). If the seller was already paid, the amount is reversed from their Stripe balance, and anything left over is deducted from their next payouts. |
| Seller reserve | **None.** The delivery hold above is the only protection. |
| Sales tax | **Stripe Tax** adds sales tax at checkout; Synthora collects and remits it as the marketplace facilitator in states where it is registered. Tax is never seller money and is not included in commission. |

**Worked example:** a T-shirt priced at $29.00 made by Printify, with $4.75 shipping.

| | |
| --- | --- |
| Buyer pays (before sales tax) | $33.75 |
| Commission (8% of $29) | −$2.32 |
| Card processing (at cost) | −$1.28 |
| **Paid out to seller** | **$30.15** |
| Printify bills the seller (production $8.07 + shipping $4.75) | −$12.82 |
| **Seller keeps** | **$17.33** |

Any sales tax is added on top of the $33.75 and passed to the state. Platform revenue = commission + $3/month per active seller.

## 6. Requirements

Status key: ✅ built and tested · 🟡 built, but needs real-account testing or a decision before launch · ⬜ not built

For the evidence behind each status (which test, which sandbox order), see [READINESS.md](READINESS.md).

### 6.1 Disclosure and product rules

| ID | Requirement | Status |
| --- | --- | --- |
| R1 | Only AI-made products may be listed; fully AI-made is welcome | ✅ enforced in seller terms, listing flow and prohibited-items policy |
| R2 | Every listing names the AI tool used (pick list + "Other") | ✅ required field, shown on cards and product page |
| R3 | Every listing has a "how it was made" note; optional prompt and "fully AI vs AI + edits" | ✅ required (min. one sentence), shown on the product page |
| R4 | Seller must confirm they have the rights to sell each item | ✅ required checkbox; timestamp stored on the listing |
| R5 | A person reviews every new listing and every material edit before it sells; the approved version keeps selling while an edit waits | ✅ Admin → Review queue |
| R6 | Product images say what they are ("Mockup", "Preview", "Artwork preview") so a render is never passed off as a photo | ✅ |

### 6.2 Buyer experience

| ID | Requirement | Status |
| --- | --- | --- |
| B1 | Home page in the brand's editorial format (adapted from the Webflow "Fre" template) | ✅ |
| B2 | Shop with search and filters: category, product type, AI tool, price, digital vs physical; sorting; pagination | ✅ |
| B3 | Product page: photos/mockups, price, variants, AI disclosure panel, delivery info, seller card, reviews | ✅ |
| B4 | Seller shop pages | ✅ |
| B5 | Cart spanning multiple sellers, re-priced on the server | ✅ |
| B6 | Checkout with live shipping quotes from each partner; pay on Stripe Checkout; guest checkout; US addresses only; a double click never charges twice | ✅ verified in the Stripe sandbox (order SYN-261006-WHHMS) |
| B7 | Order tracking page per seller: progress, tracking links, digital downloads, confirm delivery | ✅ |
| B8 | Buyer account: orders and notifications. Email must be verified before past guest orders attach to an account | ✅ |
| B9 | Reviews after delivery (verified purchase only) | ✅ |
| B10 | Report-a-listing on every product | ✅ |
| B11 | Secure digital downloads (short-lived signed links, owner-only, download cap); the buyer always gets the exact file version they bought | ✅ |
| B13 | Licence shown before purchase (Personal use / Small business) and kept with the order | ✅ licence texts pending legal review |
| B14 | "Get help with this order" on every order page; email verification and password reset | ✅ |
| B15 | Sales tax calculated on Stripe Checkout (Stripe Tax) | 🟡 built; needs the head office address in Stripe Tax settings before sandbox checkout works, and state registrations before live |
| B12 | Light and dark themes; WCAG AA contrast; works at 360px | ✅ |

### 6.3 Seller experience

| ID | Requirement | Status |
| --- | --- | --- |
| S1 | Onboarding: create shop → Stripe Connect Express → $3/month plan → choose fulfillment → admin approval. Optional invite-only signup | ✅ (Connect with a real Express account 🟡) |
| S2 | **"Make one with AI"**: pick product + partner → describe in plain words → 4 AI versions → realistic mockup → auto-written title/description/disclosure → price with live earnings math → submit for review. Generation is metered (hourly, daily and platform-wide caps, off switch) | ✅ (real OpenAI/Claude keys 🟡) |
| S3 | Mockups from the partner's mockup API when available; otherwise our own renderer | ✅ renderer; partner mockups 🟡 (Printful/Printify, untested with real keys) |
| S4 | **"List my own"**: digital files, self-shipped items, or own artwork on a partner product, with the same disclosure fields. Uploaded files are checked (real format, no hidden programs, enough pixels for the print size) | ✅ |
| S5 | Dashboard: sales, held/ready/paid balances, alerts (to ship, partner failures, plan lapsed) | ✅ |
| S6 | Listings: edit, pause, publish, delete (kept for records if sold) | ✅ |
| S7 | Orders: add tracking (self-ship), retry failed partner orders, refund the buyer | ✅ |
| S8 | Earnings & billing: per-order breakdown, transfers, any balance owed after a refund, plan status, billing portal, Stripe Express dashboard | ✅ |
| S9 | Partners page: connect Printify/Printful/Gelato with an API key (Printful OAuth optional); keys encrypted at rest | ✅ (🟡 real accounts) |
| S10 | IP counter-notice from a removed listing | ✅ |

### 6.4 Fulfillment

| ID | Requirement | Status |
| --- | --- | --- |
| F1 | One `FulfillmentProvider` interface: `listCatalog`, `getQuote`, `createOrder`, `getStatus`, `cancel`, webhook handler | ✅ [`src/fulfillment/types.ts`](../src/fulfillment/types.ts) |
| F2 | Adapters for **Printify, Printful, Gelato** (real API calls behind keys, mock mode without) | 🟡 written against the public APIs; tested with stubbed responses only |
| F3 | **"I ship it myself"** (seller enters tracking) and **digital delivery** | ✅ |
| F4 | Each listing stores its partner, partner product/variant IDs and base cost | ✅ |
| F5 | Adding a partner = one adapter file, nothing else | ✅ registry is generated; contract tests run on every adapter |
| F6 | On payment, partner orders are created automatically from the exact file and spec the buyer paid for; retried safely; on failure the seller is flagged and the buyer notified | ✅ |
| F7 | Partner webhooks verified and de-duplicated; hourly status polling as a fallback | ✅ |
| F8 | Curated partner catalogs (product/variant IDs, base costs) reviewed against live catalogs | ⬜ do before launch |
| F9 | One physical product sampled and verified end to end with a real partner before physical goods are switched on | ⬜ |

### 6.5 Payments and money

| ID | Requirement | Status |
| --- | --- | --- |
| P1 | Stripe Connect Express with separate charges and transfers (one charge per cart, transfers per seller) | ✅ charge verified in sandbox; transfers to a real Express account 🟡 |
| P2 | Commission kept automatically; card fee passed through at actual cost (estimated at payment, corrected to Stripe's actual fee) | ✅ verified in sandbox |
| P3 | Funds held until delivery confirmed or hold window passes; daily payout job | ✅ |
| P4 | Stripe Billing for the $3/month plan; failed plan pauses listings | ✅ |
| P5 | Webhooks: payment, expiry, refunds, disputes, subscriptions, Connect account updates; idempotent | ✅ |
| P6 | Refunds (partial/full, per seller) with transfer reversal after payout | ✅ |
| P7 | Disputes block payouts; won disputes release them; lost disputes count as refunds | ✅ |
| P8 | Append-only ledger of every money movement | ✅ |
| P8a | Crash-safe payments, transfers and refunds: each is recorded before it is sent, retried with the same key, and looked up at Stripe if the reply is lost; unclear cases go to the action queue | ✅ |
| P8b | Daily reconciliation against Stripe; any difference halts that seller's payouts | ✅ verified in sandbox |
| P9 | Recover a seller's leftover negative balance (after a post-payout refund) from their next payout | ✅ |
| P10 | Sales tax via Stripe Tax: collected at checkout, refunded in proportion, kept out of seller money, reconciled | ✅ built; Stripe Tax setup and state registrations 🟡 |

### 6.6 Operator / admin

| ID | Requirement | Status |
| --- | --- | --- |
| A1 | Approve, suspend and reinstate sellers (suspension hides listings and blocks payouts) | ✅ |
| A2 | Suspend, remove and restore listings | ✅ |
| A3 | Review reports and IP/copyright notices; act on counter-notices | ✅ |
| A4 | Fees collected (commission, plans), GMV, seller money held/due/paid | ✅ |
| A5 | Refund orders (whole order or per seller) | ✅ |
| A6 | Order and payout ledger; email outbox; audit log of admin actions | ✅ |
| A7 | Admins need a stored admin role, a verified email and a second sign-in step (authenticator app) | ✅ |
| A8 | Review queue for new listings and edits, with automatic file-check results | ✅ |
| A9 | Action queue: unconfirmed money operations, failed jobs, failed partner orders, seller debts, halted payouts | ✅ |
| A10 | Reconciliation, launch readiness and funnel pages | ✅ |

### 6.7 Legal and safety

| ID | Requirement | Status |
| --- | --- | --- |
| L1 | Seller terms, buyer terms, privacy, returns policy, prohibited items, IP policy + takedown form, licences | 🟡 drafted and live, **pending legal review** (owner: Griffin Feldt) |
| L2 | No raw card data stored (Stripe Checkout only) | ✅ |
| L3 | No secrets in the repo; partner keys encrypted at rest, with key rotation | ✅ |
| L4 | Purchased files and design originals kept in private storage; only reduced previews are public | ✅ (real bucket policies 🟡) |

## 7. Key flows

**Buy:** browse → product page (read the disclosure and licence) → cart (several shops) → checkout (US address → live shipping) → Stripe (sales tax added) → order page → tracking → confirm delivery → review.

**Sell with AI:** sign up → set up payouts, plan and a partner → *Make one with AI* → choose a product and partner → describe the design → pick one of four → see the mockup → edit the auto-written copy → set the price (live earnings) → confirm rights → submit → a person approves it → it goes live.

**Money:** buyer pays the platform → split per seller (commission + fee) → partner orders created → partner webhooks move the order to shipped/delivered → hold window → daily transfer to the seller's Stripe account (blockers rechecked at that moment; marked paid only once Stripe confirms). Refunds and disputes adjust or reverse that seller's part only. Sales tax sits in its own account and goes to the states. A daily reconciliation compares everything with Stripe.

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Security | Signed webhooks; secrets only in environment variables; encrypted partner credentials; private bucket + signed links for digital goods; file checks and ownership checks on every upload; rate limits on sign-in, codes and uploads; admin two-step sign-in; mock routes disabled once Stripe is live |
| Accessibility | WCAG 2.1 AA contrast in both themes; keyboard focus styles; labelled controls; alt text on all product images; reduced-motion respected |
| Performance | Mockups rendered as lightweight SVG (pre-baked grain texture instead of live filters); server-rendered pages |
| Reliability | Idempotent webhooks and payouts; durable background jobs with retries; cron fallback for missed partner webhooks; every money movement in the ledger; daily reconciliation; backups with a tested restore |
| Responsiveness | Works from 360px wide with no sideways scrolling |
| Configuration | Three modes: demo (all simulated), test (Stripe sandbox), live (refuses to start unless every service is real and every launch gate is signed off) |
| Testability | Demo mode for every integration; 121 automated tests (money, identity, listings, profiles, webhooks, adapters) plus 11 browser tests including mobile, keyboard and accessibility checks |

## 9. Success metrics (proposed)

| Metric | Target for the first 90 days |
| --- | --- |
| Time from "New listing" to published (AI studio) | Median under 3 minutes |
| Seller activation (signed up → first published listing) | 60%+ |
| Listings with a substantive "how it was made" note | 100% (required) |
| Checkout conversion (cart → paid) | 3%+ of sessions with a cart |
| Partner order failure rate | Under 2% of partner orders |
| Disputes | Under 0.5% of orders |
| Monthly platform revenue | Commission + plans covering hosting and tools by month 3 |

The north star is fulfilled, unrefunded orders from independent buyers. Exact definitions, and how test and staff traffic is excluded, are in [METRICS.md](METRICS.md).

## 10. Launch plan

### Decisions made (recorded in `src/config/launch.ts`)

| Gate | Decision |
| --- | --- |
| Territory | United States only, buyers and sellers |
| Sales tax | Stripe Tax; Synthora collects and remits as the marketplace facilitator where registered |
| Refunds | The published Returns & problems policy; anything outside it decided case by case by the support owner |
| Seller reserve | None beyond the delivery hold |
| Support owner | Griffin Feldt (backup: Grady) |
| Reconciliation owner | Griffin Feldt (backup: Grady) |
| Legal review | **Open** (Griffin Feldt). Live mode will not start until it is signed off. |

### Steps

1. **Accounts:** Supabase or S3 (database + public and private storage), Resend, OpenAI, Anthropic, Vercel, domain (synthora.market), help@ and privacy@ inboxes.
2. **Stripe:** finish Stripe Tax setup (head office address, then state registrations), branding (icon, logo, statement descriptor SYNTHORA.MARKET), Connect onboarding with one real Express account, live activation.
3. **Partner verification:** connect a real Printify, Printful and Gelato account; check catalog IDs and base costs (F8); sample one product (F9).
4. **Legal review** of all `/legal` pages, the licences and the product tax codes.
5. **Pilot decisions:** pricing ($3/month + 8%, or the review's 15%-no-subscription test) and pilot scope (digital only, invite-only sellers, one shop per checkout). All are switches in `src/config/launch.ts`.
6. **Test-mode launch:** taxed purchase with Stripe test cards, refund it, payout to a real test Express account, reconciliation clean.
7. **Live launch:** live keys, one real purchase and refund, then invite the first sellers.

The step-by-step checklist (env vars, webhook URLs, partner setup, domain) is in the [README](../README.md#go-live-checklist).

## 11. Risks and open questions

| Risk / question | Notes |
| --- | --- |
| Copyright and AI | AI images can imitate existing work. Mitigations: rights checkbox, prohibited-items policy, reports, IP takedown flow. Needs legal review. |
| AI tool licences | Some AI tools restrict commercial use on free tiers. Sellers confirm compliance; consider listing known restrictions in the help docs. |
| Partner APIs untested live | Adapters follow the documented APIs but haven't placed a real order yet. First order with each partner is a test. |
| Sales tax | Stripe Tax only collects where Synthora is registered. Registrations, product tax codes and filing need a tax adviser before live. |
| Seller negative balances | Recovered from later payouts (P9). A seller who leaves owing money is written off by an admin; with no reserve, that loss is the platform's. |
| Fraud and chargebacks | Holds and dispute blocking limit exposure; consider Stripe Radar rules and limits for new sellers. |
| Self-ship delivery | No carrier tracking API, so self-shipped orders release on buyer confirmation or after 30 days. |
| Demand is unproven | No buyer or creator interviews yet; the review recommends a small, curated, paid pilot before scaling. |
| AI cost | Image generation costs real money; capped per seller and platform-wide, and can be switched off instantly (`AI_STUDIO_ENABLED=false`). |

## 12. Appendix: trying the product

The full app runs locally with no keys; see the [README](../README.md#run-it-locally-no-keys-needed). Demo accounts (password `synthora-demo`):

| Account | Shows |
| --- | --- |
| `admin@synthora.market` | Admin area (asks you to set up an authenticator app on first sign-in) |
| `buyer@example.com` | Buyer with orders in every state |
| `nightshift@example.com` | Seller using Printful + Printify |
| `geometry@example.com` | Seller using Gelato + digital files |
| `patches@example.com` | Seller who ships embroidered patches |
| `newshop@example.com` | Seller awaiting approval |
