# Synthora readiness matrix

Last updated: 5 October 2026, after working through the
[complete review](reviews/2026-10-05-complete-review.md).

Each requirement has one status:

| Status | Meaning |
|---|---|
| **Documented** | Described, not built. |
| **Implemented** | Code exists. |
| **Tested locally** | An automated test passes against a local database (`npm test`, `npm run e2e`). Mock tests do not prove a provider integration. |
| **Verified with provider** | Exercised against the real provider in its test mode, with a receipt (an order number, event id or run id). |
| **Approved for production** | A named person signed it off for real money. **Nothing is at this status yet.** |

A status names its evidence. "Tested locally" is not "verified with provider", and neither is "approved".

## Functional requirements (review section 9)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| ID-01 | Guest orders attach only after proving mailbox control | Tested locally | `tests/identity.test.ts` (unverified claimant sees nothing; link verifies then links; single-use, expiry, email-change). e2e `auth.spec.ts` sign-up → confirm. |
| ID-02 | Admin = stored role on a verified account + second factor | Tested locally | `tests/identity.test.ts` (ADMIN_EMAILS grants nothing; TOTP RFC 6238 vectors; code guessing rate-limited). e2e `auth.spec.ts` admin 2FA. Roles granted only by `npm run admin:grant`. |
| CFG-01 | DEMO / TEST / LIVE profiles; live refuses mocks and missing config | Tested locally | `tests/profiles.test.ts` (live blocks on test key, storage, email, secrets, gates; live key in test mode blocked; demo shops hidden and unpaid; demo partner connections refused). Server refuses to start: `src/instrumentation.ts`. |
| CAT-01 | Only the approved version is sold; edits go back to review | Tested locally | `tests/listings.test.ts` (pending listing not purchasable; live edits wait while the approved version keeps selling; changes requested keeps it live). Browser: review queue approval. |
| AST-01 | Every file is a server-owned asset; URLs are not ownership | Tested locally | `tests/listings.test.ts` (another seller's file, forged generation link, foreign image host all refused). |
| AST-02 | Private originals; missing private storage blocks; previews cannot rebuild the file | Tested locally | `tests/listings.test.ts` (no public fallback bucket; previews ≤ 800 px; original unreadable publicly). Browser check: original returns 404 on the public route, tampered signed link 403. Real bucket policies: **not verified** (use Admin → Readiness → Test bucket policies once S3 is configured). |
| AST-03 | Files checked: count, hash, format, dimensions, print size | Tested locally | `tests/listings.test.ts` (disguised/active/zip-with-program files rejected; changed-after-check file blocked; too few pixels for the sizes offered blocked). No malware scanner is attached (hook: `scanForThreats` in `src/server/assets.ts`). |
| LIC-01 | Buyer sees the licence and version before paying; entitlement keeps it | Tested locally | Listing page shows licence; order page shows "the version you bought (vN) · licence vN". Licence texts are **drafts** needing legal review. |
| BUY-01 | Digital vs physical, contents, price and mockup labels visible at 360 px and by keyboard | Tested locally | e2e `mobile.spec.ts` (no sideways scroll at 360 px, delivery line visible), `buyer.spec.ts` (keyboard add to cart; axe: no serious/critical issues on listing, shop, checkout, sign-up). |
| BUY-02 | Server reprices; a double submit does not double charge | Tested locally | `tests/money.test.ts` (same checkout key → one order), e2e double-click. Stripe session creation also uses an idempotency key per order. |
| PAY-01 | Only a signed "paid" event with the right amount and currency releases anything | Verified with provider | `tests/money.test.ts` (mismatch holds the order for a person). Stripe sandbox order **SYN-261006-WHHMS** (5 Oct): webhook 200, amount checked, file unlocked. |
| PAY-02 | Crash, replay and concurrency recovery for provider calls | Tested locally | `tests/money.test.ts` (crash after commit then replay → one partner order; partner reply lost → found by lookup; transfer and refund replies lost → recovered once). Real-provider crash recovery: **not verified**. |
| PAY-03 | Estimated vs actual card fee, reconciled with a ledger entry | Verified with provider | `tests/money.test.ts` (adjusts exactly once). SYN-261006-WHHMS: fee recorded as an estimate at payment; the reconcile job later read Stripe's actual fee (65¢, equal to the estimate) and marked it actual. |
| PAY-04 | Refunds, reversals, disputes and negative balances reconcile | Tested locally | `tests/money.test.ts` (concurrent refunds; refused reversal → debt → recovered from next payout; reconciliation OK). Policy text in seller terms matches. |
| PAY-05 | Payout eligibility re-checked at execution; PAID only after Stripe confirms | Tested locally | `tests/money.test.ts` (dispute/halt at payout time; lost transfer reply → one transfer). Transfers to a real Connect account: **not verified** (seeded sellers have fake account ids). |
| DEL-01 | A purchase downloads its exact file version; others are refused | Tested locally | `tests/listings.test.ts` (replacing a file leaves past buyers on theirs; refund revokes). Verified in the browser on SYN-261006-WHHMS. |
| OPS-01 | Every failure has an owner, a retry policy and an escalation time | Implemented | Admin → Action queue (unconfirmed operations, failed jobs, failed partner orders, seller debts, halted payouts). Support and reconciliation owner: Griffin Feldt, backup Grady (`LAUNCH.gates`, 5 Oct). |
| OPS-02 | Daily provider-vs-ledger reconciliation halts affected payouts | Verified with provider | `tests/money.test.ts` (ledger difference halts seller). Admin run against the Stripe sandbox, 5 Oct: 6 orders, no differences. |
| SEC-01 | Ownership, budgets, rate limits, CSRF, secret handling, security log | Tested locally | Rate limits (`tests/identity.test.ts`), budgets (`tests/profiles.test.ts`), same-origin checks on upload routes, failed sign-ins and 2FA attempts in the audit log, key rotation (`npm run secrets:reencrypt`). No external penetration test. |
| LEG-01 | Territory and tax decided before real checkout | Implementation pending provider verification | US-only territory, Stripe Tax and no extra seller reserve selected (5 Oct). Checkout and Billing request Stripe Tax; tax is tracked separately from seller earnings. Tax registration/classification and a taxed sandbox purchase/refund still need verification. Legal review remains unsigned in `src/config/launch.ts`. |
| ANA-01 | Events separate real users from demo, staff, test and bots | Tested locally | `tests/profiles.test.ts` (dedupe, flags). Admin → Funnel. Definitions: [METRICS.md](METRICS.md). |
| ACC-01 | Manual keyboard, screen-reader and contrast checks | Partly tested | Automated axe checks and keyboard path in e2e. **No manual screen-reader pass has been done.** |
| AI-01 | Generation optional, metered, attributable; no silent fallback | Tested locally | `tests/profiles.test.ts` (atomic reservation, hourly and platform caps, off switch, eligibility). The demo generator is labelled "not an AI model"; the template writer is labelled when Claude is unavailable. |
| POD-01 | One physical product fully verified before activation | Documented | Not started: needs a sampled product with one real partner account. |

## Remediation tickets

| Ticket | Status | Where |
|---|---|---|
| SYN-001 Identity | Tested locally | `src/server/identity.ts`, `src/app/actions/auth.ts`, `/verify-email`, `/forgot-password`, `/reset-password`, `/two-factor`, `scripts/admin.ts` |
| SYN-002 Studio digital path | Tested locally, checked in the browser | `src/server/studio.ts`, `src/server/listings.ts`, AI wizard |
| SYN-003 Originals, previews, versions | Tested locally | `src/lib/storage.ts`, `src/server/assets.ts`, upload routes, download route |
| SYN-004 Paid-order recovery | Tested locally | `src/server/orders.ts`, `src/server/jobs.ts`, `src/server/job-handlers.ts`, cron `run-jobs` |
| SYN-005 Transfers and refunds | Tested locally | `src/server/operations.ts`, `payouts.ts`, `refunds.ts`, `resolution.ts` |
| SYN-006 Actual fees and seller debt | Tested locally | `reconcileOrderFee`, `SellerReceivable`, `src/server/receivables.ts` |
| SYN-007 Production profiles | Tested locally | `src/lib/env.ts`, `src/lib/readiness.ts`, `src/instrumentation.ts` |
| SYN-008 Launch responsibilities | Implemented as gates; **decisions open** | `src/config/launch.ts`, legal copy updated to match behaviour |
| SYN-009 Generation metering | Tested locally | `src/server/usage.ts` |
| SYN-010 Ownership checks | Tested locally | `ownedAssets`, partner image host allow-list |
| SYN-011 Frozen fulfillment specs | Tested locally | order item snapshot fields; `tests/money.test.ts` |
| SYN-012 Versions, checks, review, evidence labels | Tested locally | `ListingVersion`, `listing-checks.ts`, Admin → Review queue, listing page |
| SYN-013 Funnel instrumentation | Tested locally | `src/server/analytics.ts`, Admin → Funnel |
| SYN-014 Browser and incident gaps | Tested locally | `e2e/` (11 Playwright tests), `npm run backup:check` (restore verified on the dev database, 5 Oct) |

## Not done, by design or because it needs a person

- **Pricing** stays at $3/month + 8%. The review's 15%-no-subscription test is a founder decision.
- **Pilot scope** (digital only, invite-only sellers, one shop per checkout) is available as switches in `src/config/launch.ts` but not switched on.
- **Launch gates**: territory (US only), refund policy (published Returns & problems policy, anything else case by case) and the support and reconciliation owners (Griffin Feldt, backup Grady) are signed off. Tax policy, legal review and reserve policy are still empty, so live mode will not start.
- **Real providers**: S3 bucket policies, Resend, Printful, Printify and Gelato with real keys, Connect payouts to a real Express account.
- **Business validation**: buyer and creator interviews, curated collections, acquisition channel, paid pilot.
- **Copyright licence for the repository** and the provenance of the Webflow template the design brief references.
