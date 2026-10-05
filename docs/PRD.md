# Latent.Market — Product Requirements Document

| | |
| --- | --- |
| **Status** | v1 built; running in demo mode; not yet launched |
| **Last updated** | 5 October 2026 |
| **Related docs** | [README](../README.md) (setup + go-live checklist) · [Architecture](ARCHITECTURE.md) · [Design brief](DESIGN.md) |

---

## 1. Summary

Latent.Market is an online marketplace where every product is made with AI, and says so. Sellers turn a few words into a real product (a T-shirt, poster, mug, sticker, embroidered patch or digital file) and list it in minutes. Buyers see exactly which AI tool made each item and how.

Latent.Market sits in the middle of every sale. Buyers pay the platform. The platform keeps a commission, holds the seller's money until the order is delivered, then pays the seller. Production is handled by print-on-demand partners (Printify, Printful, Gelato) that each seller connects with their own account, or by the seller (self-ship), or not at all (digital downloads).

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

### Non-goals (v1)
- Non-AI or handmade-only products.
- Multiple currencies; sales tax calculation.
- Native mobile apps (the site is responsive down to 360px).
- Holding inventory or running a warehouse.
- Messaging between buyers and sellers (support is by email).
- Auctions, offers, coupons, or seller-run ads.

## 4. Users

| User | Who they are | What they need |
| --- | --- | --- |
| **Buyer** | Someone shopping for prints, apparel, gifts or digital art, comfortable with AI-made goods | Browse and search, trust that the AI disclosure is real, check out quickly (guest is fine), track orders, get help if something goes wrong |
| **Seller** | A hobbyist or small creator who makes designs with AI tools | A fast way to make and list products, clear earnings math, reliable payouts, no inventory, control over which partner makes each item |
| **Operator (admin)** | The marketplace owner | Approve and moderate shops and listings, handle reports and IP notices, refund orders, see fees collected and the money ledger |

## 5. Business model

All values live in one config file, [`src/config/fees.ts`](../src/config/fees.ts); checkout, payouts, the calculator, legal copy and tests read from it.

| Item | Value |
| --- | --- |
| Seller plan | **$3.00/month** (Stripe Billing). If a payment fails, listings **pause**, never delete; paying restores them. |
| Commission | **8%** of the item price. No commission on shipping. |
| Card processing | Stripe's actual fee (≈2.9% + 30¢), **passed through to the seller at cost**. In a multi-seller cart the fee is split by each seller's share of the charge. |
| Partner production | Billed by the partner **directly to the seller's own partner account**. The platform never pays partner bills. |
| Payout hold | Released when the buyer confirms delivery, or 7 days after tracking shows delivered; 3 days after purchase for digital; 30 days after shipping if no delivery scan arrives. |
| Refunds | Commission is returned on the refunded amount; Stripe does not return its fee, so the seller bears it (at cost). |

**Worked example:** a T-shirt priced at $29.00 made by Printify, with $4.75 shipping.

| | |
| --- | --- |
| Buyer pays | $33.75 |
| Commission (8% of $29) | −$2.32 |
| Card processing (at cost) | −$1.28 |
| **Paid out to seller** | **$30.15** |
| Printify bills the seller (production $8.07 + shipping $4.75) | −$12.82 |
| **Seller keeps** | **$17.33** |

Platform revenue = commission + $3/month per active seller.

## 6. Requirements

Status key: ✅ built and working · 🟡 built, but needs real-account testing or a decision before launch · ⬜ not built

### 6.1 Disclosure and product rules

| ID | Requirement | Status |
| --- | --- | --- |
| R1 | Only AI-made products may be listed; fully AI-made is welcome | ✅ enforced in seller terms, listing flow and prohibited-items policy |
| R2 | Every listing names the AI tool used (pick list + "Other") | ✅ required field, shown on cards and product page |
| R3 | Every listing has a "how it was made" note; optional prompt and "fully AI vs AI + edits" | ✅ required (min. one sentence), shown on the product page |
| R4 | Seller must confirm they have the rights to sell each item | ✅ required checkbox; timestamp stored on the listing |

### 6.2 Buyer experience

| ID | Requirement | Status |
| --- | --- | --- |
| B1 | Home page in the brand's editorial format (adapted from the Webflow "Fre" template) | ✅ |
| B2 | Shop with search and filters: category, product type, AI tool, price, digital vs physical; sorting; pagination | ✅ |
| B3 | Product page: photos/mockups, price, variants, AI disclosure panel, delivery info, seller card, reviews | ✅ |
| B4 | Seller shop pages | ✅ |
| B5 | Cart spanning multiple sellers, re-priced on the server | ✅ |
| B6 | Checkout with live shipping quotes from each partner; pay on Stripe Checkout; guest checkout | ✅ (Stripe 🟡 until tested with real keys) |
| B7 | Order tracking page per seller: progress, tracking links, digital downloads, confirm delivery | ✅ |
| B8 | Buyer account: orders and notifications | ✅ |
| B9 | Reviews after delivery (verified purchase only) | ✅ |
| B10 | Report-a-listing on every product | ✅ |
| B11 | Secure digital downloads (short-lived signed links, owner-only, download cap) | ✅ |
| B12 | Light and dark themes; WCAG AA contrast; works at 360px | ✅ |

### 6.3 Seller experience

| ID | Requirement | Status |
| --- | --- | --- |
| S1 | Onboarding: create shop → Stripe Connect Express → $3/month plan → choose fulfillment → admin approval | ✅ (Stripe 🟡) |
| S2 | **"Make one with AI"**: pick product + partner → describe in plain words → 4 AI versions → realistic mockup → auto-written title/description/disclosure → price with live earnings math → publish | ✅ |
| S3 | Mockups from the partner's mockup API when available; otherwise our own renderer | ✅ renderer; partner mockups 🟡 (Printful/Printify, untested with real keys) |
| S4 | **"List my own"**: digital files, self-shipped items, or own artwork on a partner product, with the same disclosure fields | ✅ |
| S5 | Dashboard: sales, held/ready/paid balances, alerts (to ship, partner failures, plan lapsed) | ✅ |
| S6 | Listings: edit, pause, publish, delete (kept for records if sold) | ✅ |
| S7 | Orders: add tracking (self-ship), retry failed partner orders, refund the buyer | ✅ |
| S8 | Earnings & billing: per-order breakdown, transfers, plan status, billing portal, Stripe Express dashboard | ✅ |
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
| F6 | On payment, partner orders are created automatically; on failure the seller is flagged and the buyer notified | ✅ |
| F7 | Partner webhooks verified and de-duplicated; hourly status polling as a fallback | ✅ |
| F8 | Curated partner catalogs (product/variant IDs, base costs) reviewed against live catalogs | ⬜ do before launch |

### 6.5 Payments and money

| ID | Requirement | Status |
| --- | --- | --- |
| P1 | Stripe Connect Express with separate charges and transfers (one charge per cart, transfers per seller) | ✅ (🟡 real keys) |
| P2 | Commission kept automatically; card fee passed through at actual cost | ✅ |
| P3 | Funds held until delivery confirmed or hold window passes; daily payout job | ✅ |
| P4 | Stripe Billing for the $3/month plan; failed plan pauses listings | ✅ |
| P5 | Webhooks: payment, expiry, refunds, disputes, subscriptions, Connect account updates; idempotent | ✅ |
| P6 | Refunds (partial/full, per seller) with transfer reversal after payout | ✅ |
| P7 | Disputes block payouts; won disputes release them; lost disputes count as refunds | ✅ |
| P8 | Append-only ledger of every money movement | ✅ |
| P9 | Recover a seller's leftover negative balance (card fee after a post-payout refund) from their next payout | ⬜ |
| P10 | Sales tax (Stripe Tax or marketplace-facilitator setup) | ⬜ decision needed |

### 6.6 Operator / admin

| ID | Requirement | Status |
| --- | --- | --- |
| A1 | Approve, suspend and reinstate sellers (suspension hides listings and blocks payouts) | ✅ |
| A2 | Suspend, remove and restore listings | ✅ |
| A3 | Review reports and IP/copyright notices; act on counter-notices | ✅ |
| A4 | Fees collected (commission, plans), GMV, seller money held/due/paid | ✅ |
| A5 | Refund orders (whole order or per seller) | ✅ |
| A6 | Order and payout ledger; email outbox; audit log of admin actions | ✅ |

### 6.7 Legal and safety

| ID | Requirement | Status |
| --- | --- | --- |
| L1 | Seller terms, buyer terms, privacy, returns policy, prohibited items, IP policy + takedown form | 🟡 drafted and live, **pending legal review** |
| L2 | No raw card data stored (Stripe Checkout only) | ✅ |
| L3 | No secrets in the repo; partner keys encrypted at rest | ✅ |

## 7. Key flows

**Buy:** browse → product page (read the disclosure) → cart (several shops) → checkout (address → live shipping) → Stripe → order page → tracking → confirm delivery → review.

**Sell with AI:** sign up → set up payouts, plan and a partner → *Make one with AI* → choose a product and partner → describe the design → pick one of four → see the mockup → edit the auto-written copy → set the price (live earnings) → confirm rights → publish.

**Money:** buyer pays the platform → split per seller (commission + fee) → partner orders created → partner webhooks move the order to shipped/delivered → hold window → daily transfer to the seller's Stripe account. Refunds and disputes adjust or reverse that seller's part only.

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Security | Signed webhooks; secrets only in environment variables; encrypted partner credentials; private bucket + signed links for digital goods; ownership checks on uploads; mock routes disabled once Stripe is live |
| Accessibility | WCAG 2.1 AA contrast in both themes; keyboard focus styles; labelled controls; alt text on all product images; reduced-motion respected |
| Performance | Mockups rendered as lightweight SVG (pre-baked grain texture instead of live filters); server-rendered pages |
| Reliability | Idempotent webhooks and payouts; cron fallback for missed partner webhooks; every money movement in the ledger |
| Responsiveness | Works from 360px wide with no sideways scrolling |
| Testability | Demo mode for every integration; 73 automated tests for fee math, payout splits, the adapter contract and webhook handling |

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

## 10. Launch plan

1. **Accounts:** Supabase (database + storage), Stripe (Connect Express + Billing), Resend, OpenAI, Anthropic, Vercel, domain.
2. **Partner verification:** connect a real Printify, Printful and Gelato account; check catalog IDs and base costs (F8); place one test order with each.
3. **Legal review** of all `/legal` pages; decide on sales tax (P10).
4. **Test-mode launch:** full purchase with Stripe test cards, refund it, verify payouts and webhooks.
5. **Live launch:** live keys, one real purchase and refund, then invite the first sellers.

The step-by-step checklist (env vars, webhook URLs, partner setup, domain) is in the [README](../README.md#go-live-checklist).

## 11. Risks and open questions

| Risk / question | Notes |
| --- | --- |
| Copyright and AI | AI images can imitate existing work. Mitigations: rights checkbox, prohibited-items policy, reports, IP takedown flow. Needs legal review. |
| AI tool licences | Some AI tools restrict commercial use on free tiers. Sellers confirm compliance; consider listing known restrictions in the help docs. |
| Partner APIs untested live | Adapters follow the documented APIs but haven't placed a real order yet. First order with each partner is a test. |
| Sales tax | Not calculated. Decide on Stripe Tax vs. relying on marketplace-facilitator rules before launch. |
| Seller negative balances | After a refund on an already-paid order, the seller can owe the card fee; not yet auto-recovered (P9). |
| Fraud and chargebacks | Holds and dispute blocking limit exposure; consider Stripe Radar rules and limits for new sellers. |
| Self-ship delivery | No carrier tracking API, so self-shipped orders release on buyer confirmation or after 30 days. |

## 12. Appendix: trying the product

The full app runs locally with no keys; see the [README](../README.md#run-it-locally-no-keys-needed). Demo accounts (password `latent-demo`):

| Account | Shows |
| --- | --- |
| `admin@latent.market` | Admin area |
| `buyer@example.com` | Buyer with orders in every state |
| `nightshift@example.com` | Seller using Printful + Printify |
| `geometry@example.com` | Seller using Gelato + digital files |
| `patches@example.com` | Seller who ships embroidered patches |
| `newshop@example.com` | Seller awaiting approval |
