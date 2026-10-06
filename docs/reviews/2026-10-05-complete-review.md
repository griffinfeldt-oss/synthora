> Saved from `Synthora-Complete-Review.html` (5 October 2026) so the team can reference it from the code. It is a proposal for founder review; what was done in response is tracked in [docs/READINESS.md](../READINESS.md).

# Synthora
## Product strategy and proposed PRD v2

**Decision:** Build a curated marketplace for useful, distinctive AI-assisted products. Prove one buyer use case before expanding the catalog, fulfillment network or generation studio.

**Prepared:** October 5, 2026. **Status:** proposal for founder review, not an approved launch specification. **Repository:** griffinfeldt-oss/synthora, main at e7cba70411ef22061fdf27884815943f3abf1403. **Audience:** Grady, Griffin and the product/build team.

## 1. Executive decision

Synthora has a substantial marketplace implementation, but its strongest possible outcome is not “Etsy, except everything is AI.” Buyers need a reason to choose a product, trust its quality and return. The AI label is useful disclosure; it is not sufficient differentiation.

My recommended initial hypothesis is **curated, coordinated printable art collections for first-apartment and home-office shoppers**. A buyer gets a cohesive set, clearly specified files, honest previews, printing guidance and a named creator. Start digital-only with a small invited seller group. Keep the platform AI-native and transparent, while making the headline about the finished result.

This niche is a testable choice based on fit with the current code and lower fulfillment complexity. It is not proven demand, a market-size estimate or a prediction that wall art will win. Validate it against a physical-print offer before committing. If qualified buyers consistently want a finished print instead of a file, test one sampled poster product through one partner after the production gates pass.

**Positioning proposal:** “Coordinated art for your space, made with AI and finished with care.”

The initial advantage should be curation, coherent collections, trustworthy specifications and a dependable purchase experience. The longer-term advantage could be a record of which designs, formats, creators and production choices satisfy real buyers. Adding more AI models or more sellers does not create that advantage by itself.

### What I would do next

1. Fix the account/ownership and payment-recovery blockers in section 4 before any paid pilot.
2. Interview ten qualified buyers and five potential creators using a small set of realistic product pages.
3. Prepare 20 genuinely reviewed collections from approximately five invited creators. Use their existing work; do not fund unlimited generation.
4. Test a finite digital pilot only after the legal, tax, security and money-flow gates pass.
5. Expand only when buyer demand, delivered quality and contribution economics support it.

Do not launch all apparel, homeware, embroidery, digital files, three POD partners and self-shipping at once. Preserve that code behind disabled capabilities rather than deleting useful work.

## 2. What the repository actually establishes

The inspected snapshot contains 182 tracked files: 180 text files and two texture PNGs. All 182 retrieved files matched the Git blob identities in the complete, non-truncated tree. One branch, main, and no issues were returned during this review. The inventory includes product/design/architecture docs, application routes, domain services, schema/migration/seed data, adapters, configuration and tests.

This review is source-backed product and technical analysis. The existing app was not installed, executed, penetration-tested or transacted through during this pass. UI, accessibility and “73 tests” claims in the existing PRD are repository claims, not new verification receipts. No deployment, customer revenue, active sellers or production traffic was established. Generated art, seed orders and mock partner responses are demonstrations.

### Keep these foundations

- One Next.js application, Postgres/Prisma data model and clear domain-service layer
- Shared fee configuration and integer-cent accounting utilities
- Server-side repricing and seller/order/fulfillment separation
- Typed payment and fulfillment interfaces with useful demo implementations
- Seller/admin views, disclosure fields, moderation cases and audit records
- Signed download routes and webhook checks as foundations to harden
- A coherent editorial visual identity rather than a generic dashboard storefront

### Change how readiness is reported

Use five statuses: **documented, implemented, tested locally, verified with provider, approved for production**. A green checkbox must name its supporting evidence. Mock tests cannot certify a provider integration. A rights checkbox cannot certify copyright ownership. A running payment SDK cannot certify the platform's legal or tax setup.

## 3. Market assumptions to correct

### AI acceptance is not an empty market

Etsy expressly permits seller-prompted AI creations and requires disclosure. Therefore the old PRD's suggestion that general marketplaces make sellers bury AI disclosure is not a sound blanket competitive claim. Synthora should compete on the outcome and shopping experience rather than assume AI sellers have nowhere to sell. [Etsy Creativity Standards](https://www.etsy.com/legal/creativity/)

Printify offers a free Pop-Up Store with integrated production and shipping, while explicitly noting that creators must bring traffic. “Generate, publish and fulfill” already has strong substitutes. Synthora must either bring qualified demand or make a specific workflow materially better. [Printify Pop-Up Store](https://printify.com/pop-up-store/)

Gumroad offers another digital-product alternative with published direct/discovery pricing and a merchant-of-record proposition. Its responsibilities and pricing are not directly comparable to a self-operated Stripe Connect marketplace. Do not compare only headline percentages. [Gumroad pricing](https://gumroad.com/pricing)

### Three directions considered

**A. Broad AI-only consumer marketplace:** closest to the current vision, but highest cold-start, quality-control, support and capital complexity. Defer broad rollout.

**B. Curated printable art collections:** strongest near-term fit with the existing catalog and digital delivery. Smaller operational surface; still crowded and vulnerable to “I can generate this myself.” Recommended initial validation hypothesis.

**C. Creator workflow software:** easier to demonstrate time saved, but generation/POD platforms already offer much of it. Retain as a possible pivot only if creators will pay for a specific proven workflow and buyer acquisition fails.

An alternative niche, such as commercial design packs, should replace B only after evidence. Do not build several niches concurrently. Commercial packs require different licensing, file-format, compatibility and buyer-support requirements; they are not a free category toggle.

## 4. Source-backed launch blockers

These are static findings and review hypotheses, not claims that a live system was exploited. Paths refer to the pinned repository snapshot. Confirm each with isolated regression tests before fixing and closing it.

### P0: account ownership and administrative authority

`src/app/actions/auth.ts` creates a password account and attaches guest orders matching the submitted email before proving control of that mailbox. `src/server/session.ts` also treats an email listed in ADMIN_EMAILS as administrative authority. Where an allowlisted address has no existing account, registration with that address appears sufficient to obtain that authority.

**Required:** verified mailbox ownership before guest-order attachment; explicit persisted admin-role provisioning; no privilege from an unverified email string; admin MFA; login and registration abuse controls. Test an unverified account claiming an existing guest email and an allowlisted admin email. Neither may obtain protected data or privileges.

### P0: digital studio publication is internally inconsistent

`AiWizard.tsx` submits `digitalAsset: null`. `listingInputSchema` rejects a DIGITAL listing without an asset. `createListingAction` parses that schema before its intended design-to-private-file conversion. This makes the documented studio digital path appear unable to reach the conversion step.

**Required:** distinguish a draft generation reference from an approved deliverable, materialize and validate the file before final listing validation, and test the complete digital flow. Do not merely weaken the schema to accept missing files.

### P0: private files must fail closed

`src/lib/storage.ts` and the presigned-upload route fall back to the public bucket when the private bucket is absent. Generated design originals are also written publicly by the studio; copying the same original into private storage does not make its public copy private. The latter concern applies if the currently blocked studio flow is repaired without redesigning asset handling.

**Required:** separate private originals from reduced-resolution previews; reject live startup without private storage; verify actual bucket policy; revoke access appropriately; bind download entitlement to the purchased asset version. A cache-control header is not an access-control policy.

### P0: processing claims exceed recovery guarantees

`markOrderPaid` commits PAID before notifications and fulfillment dispatch. A crash after that commit can leave downstream work incomplete, while a retry returns alreadyPaid. The fallback poller only targets submitted/in-production/shipped fulfillments, not every unpaid dispatch obligation.

`payOutSellerOrder` marks payoutStatus PAID before the external transfer. A process crash at that boundary can leave a locally paid record without a verified transfer. Refund paths call external systems and update local state without a durable operation/reconciliation model. Sequential idempotency tests do not prove crash or concurrent safety.

**Required:** durable work/outbox records, unique operation IDs, processing leases, explicit pending/confirmed/failed/unknown states, replay-safe effects and reconciliation against provider receipts. Inject crashes at every external-call/DB boundary. Never label an uncertain external effect “done.”

### P0: estimated processing fees can become permanent

`src/server/orders.ts` falls back to an estimate when the actual fee lookup fails, then records the result. No later actual-fee reconciliation was identified. “Passed through at actual cost” therefore needs a pending/estimated status and subsequent adjustment. Keep the historical fee-policy version on every order.

### P0: refunds, debt and reserves are incomplete

The existing PRD acknowledges missing seller negative-balance recovery. A refund notification nevertheless says unrecovered money will be deducted from the next payout. Align the promise with the implemented process. Reconcile refunds, reversals, disputes and provider costs, including partial and concurrent cases. Reserves and liability must be approved before live commerce.

### P0: production modes can mix

`src/lib/env.ts` enables services independently by key presence. Real checkout can therefore coexist with mocked fulfillment, email, image generation or storage unless stronger launch checks are added. A demo banner based on Stripe alone is insufficient.

**Required:** explicit DEMO, TEST and LIVE profiles; dependency readiness checks; no mock connections or seed identities in live commerce; fail closed on missing configuration; visibly labeled test data.

### P1: generation economics and abuse controls

The studio generates four images per request. Its 30-generation-per-seller-per-hour check is a count-before-request check, not an atomic cost reservation. The inspected action requires a seller profile but does not itself require an approved, paid seller or a funded usage allowance. Copy generation lacks an equivalent visible budget guard.

**Required:** private generation by default, atomic credit reservation, limits on concurrency and request count, per-user and platform spend caps, cancellation/timeouts, clear failed-request handling and a kill switch. Do not promise unlimited AI for $3/month.

### P1: asset ownership, quality and print readiness

Listing ownership currently uses a URL substring check plus accepted provider domains; generation association is supplied by the client. Replace these with server-owned asset IDs and ownership checks. Validate uploaded bytes after upload; declared size/MIME/extension alone is insufficient. Add scanning/quarantine appropriate to allowed formats.

The image adapter requests 1024 x 1024 images and labels its prompt “print-ready.” At 300 pixels per inch, 1024 pixels cover only about 3.4 inches. That cannot automatically satisfy all poster or apparel placements. Product-specific dimensions, bleed, resolution, transparency and physical samples must determine readiness.

### P1: production specifications and inventory

Fulfillment reads the current listing/variant when submitting an order. Freeze a purchased version, design hash, provider SKU, variant, quote and fulfillment specification. Self-ship inventory is checked before payment and decremented afterward; reservations and concurrent oversell behavior need tests. Defer self-shipping in the pilot.

### P1: discovery, measurement and operating promises

No dedicated product analytics implementation or durable retry worker was established in the inspected tree. Existing “3% of sessions with a cart” mixes funnel definitions. The UI allows several countries while sales tax is unimplemented. Existing legal/support promises need review against the actual supported territory, staffing and fulfillment behavior.

## 5. Product vision and users

**Long-term vision:** a trusted place to discover distinctive AI-assisted work from identifiable creators, with useful evidence about how it was made and what the buyer receives.

**Initial buyer hypothesis:** an adult decorating a first apartment or home office, wants several pieces that look coherent, has limited time to search, and is comfortable with disclosed AI assistance. They buy the finished selection and convenience, not the right to admire a model name.

**Initial creator hypothesis:** an invited maker with a small existing audience and the ability to curate, edit and package a complete collection. The platform should reward quality and reliable support rather than upload volume.

**Operator:** one accountable person owns moderation, incidents and reconciliation. A second named backup is required before accepting money. AI can assist review but cannot be the only escalation path.

### Core jobs

- Buyer: “Help me choose a coordinated set that fits my room and print it without guessing what I bought.”
- Creator: “Help me turn finished work into a credible offer and understand exactly what I earn.”
- Operator: “Show what is safe to sell, what is owed, what failed and what needs my attention.”

## 6. Pilot scope

### In scope

- One product family: coordinated printable art sets, initially a small catalog
- Invited, verified creators; manual collection approval
- Digital delivery with versioned files, private originals and public previews
- Buyer-facing formats, sizes, ratio, color guidance, license and print instructions
- Clear AI-use disclosure with separate evidence levels
- Verified-email accounts, secure guest delivery and support
- One seller per checkout for the first pilot; preserve multi-seller architecture for later testing
- USD and an explicitly approved initial sales territory; tax treatment decided before checkout opens
- Payment, refund, ledger and reconciliation paths with tested failure recovery
- Basic privacy-respecting funnel and operational instrumentation

### Deferred

Open seller signup, unlimited generation, three live POD providers, self-shipping, apparel sizes, embroidery, international launch, complex recommendations, social feeds, marketplace ads, native apps, multi-seller checkout, subscriptions and API marketplaces.

Digital-first is a scope recommendation, not a claim that digital commerce has no tax, copyright or fraud obligations.

## 7. Buyer experience and storefront

### Home

Lead with the buyer's outcome and actual collections. Show a few distinct room/style examples, each with real approved inventory. Use “Shop collections” as the primary CTA; creator onboarding is secondary. Do not display fabricated sales, reviews, scarcity or creator counts.

### Discovery

Primary filters: room/use, visual style, palette, print ratio, included sizes and budget. Keep AI-tool filtering available but secondary. Show useful empty states and remove filters with no inventory. Prefer a small coherent assortment to hundreds of nearly identical generations.

### Collection detail

Above the fold: actual preview, total price, “digital files; nothing ships,” exact included items, creator and primary CTA. Then show a package manifest, supported sizes, license summary, printing instructions, AI disclosure/evidence and refund/support route. Label every rendered room/product image as a mockup where appropriate.

Do not suggest that a human QA check certifies copyright ownership. Do not imply a preview frame is included. Make file and frame sizes unambiguous.

### Checkout and delivery

Show seller, total, taxes if applicable and digital-only status before payment. Treat pending payment as pending. Issue entitlements only from a verified successful payment event. Guest access uses a scoped token and verified email ownership for later account linking. Purchased files and license remain tied to their sale-time versions.

### Support

Provide a visible order-specific help route. Preserve delivery receipts and handle broken files, incorrect descriptions, chargebacks and IP disputes. Do not rely on “downloaded once” as a universal legal basis to deny assistance.

## 8. Creator and moderation experience

Creator onboarding starts with an invitation, verified identity/contact and a reviewed sample collection. Payment onboarding occurs before accepting paid orders, with clear responsibility for fees and tax information. Test whether a paid subscription is justified later; do not demand payment merely to join an empty marketplace.

Submission requires a collection title, intended use, file manifest, preview/source separation, license version, AI tool/involvement and human finishing description. Prompts are optional and private by default. A creator may have legitimate proprietary workflows; transparency does not require exposing every prompt.

Workflow: DRAFT → SUBMITTED → TECHNICAL_CHECK → HUMAN_REVIEW → APPROVED → PUBLISHED. Failed checks return a concrete reason. A material file/license/design change creates a new review version. Moderation suspension is distinct from billing suspension, voluntary pause and removal.

### Evidence labels

1. **Creator-declared AI use:** seller statement, with no verification badge
2. **Platform generation recorded:** model/job record and asset hash match the claimed generation; this does not certify commercial rights
3. **Package checked:** files, declared dimensions and manifest passed technical checks
4. **Human reviewed:** named reviewer, scope and review date; no blanket originality guarantee

Keep these labels separate. A single “verified AI” badge would blur different claims and invite mistrust.

## 9. Functional requirements and acceptance

All requirements below are proposed. An implementation receipt must cite a commit, command/test and reviewer where applicable.

- **ID-01 / P0 - Verified identity:** guest-order attachment requires proof of mailbox control; negative tests show no cross-account order or download access
- **ID-02 / P0 - Administrative access:** explicit assigned role plus stronger authentication; changing a submitted email never grants privileges
- **CFG-01 / P0 - Environment isolation:** LIVE refuses mocked payments, fulfillment or protected storage; test identities cannot purchase or receive real payouts
- **CAT-01 / P0 - Approved collections:** only the current approved version is discoverable and purchasable; edits return to review as appropriate
- **AST-01 / P0 - Asset ownership:** every deliverable/preview/generation resolves to an owned server-side object; arbitrary URL text is not ownership evidence
- **AST-02 / P0 - Private originals:** missing private storage blocks publication; unsigned access fails and public previews cannot reconstruct the full deliverable
- **AST-03 / P0 - Package quality:** file count, hash, format, dimensions and scan result recorded; corrupt/mismatched files cannot publish
- **LIC-01 / P0 - License clarity:** buyer sees the permitted use and version before payment; entitlement retains that version; no unsupported exclusivity guarantee
- **BUY-01 / P0 - Honest product page:** digital/physical distinction, contents, price and mockup labels remain visible at 360px and with keyboard navigation
- **BUY-02 / P0 - Deterministic checkout:** server validates SKU/version and price; duplicate submission does not create unintended duplicate charges
- **PAY-01 / P0 - Verified payment:** signed successful provider event matches order/currency/amount; unpaid or uncertain payment cannot grant entitlement
- **PAY-02 / P0 - Crash recovery:** replay/crash/concurrency tests cover provider calls and local commits; unknown operations enter reconciliation, never silent success
- **PAY-03 / P0 - Fee truth:** actual and estimated fees are distinct; later reconciliation adjusts ledgers with a traceable receipt
- **PAY-04 / P0 - Seller liabilities:** refunds, reversals, disputes and negative balances reconcile; a documented policy matches the implementation
- **PAY-05 / P0 - Payout release:** current eligibility, dispute and suspension checks occur at execution time; confirmed external transfer precedes a final PAID claim
- **DEL-01 / P0 - Versioned delivery:** a valid purchase downloads the purchased asset version; unrelated, expired or revoked access is rejected
- **OPS-01 / P0 - Action queue:** every failed payment effect, delivery or notification has a visible owner, retry policy and escalation deadline
- **OPS-02 / P0 - Reconciliation:** daily provider-versus-ledger comparison reports unresolved differences and halts affected payouts
- **SEC-01 / P0 - Abuse controls:** verified ownership, atomic generation/upload budgets, request limits, CSRF/session checks, secret handling and security logging are tested
- **LEG-01 / P0 - Territory/tax:** supported buyer and seller territories, tax collection/remittance responsibilities and legal documents are approved before real checkout
- **ANA-01 / P1 - Measurement:** event definitions and deduplication distinguish real users/orders from demos, founders and test transactions
- **ACC-01 / P1 - Accessibility:** manual keyboard, screen-reader and contrast checks supplement automated tests; pending/error/retry flows are included
- **AI-01 / P1 - Budgeted studio:** generation is optional, metered and attributable; no secret cost exposure or silent fallback presented as a paid model result
- **POD-01 / later - One physical product:** live catalog, print specification, physical sample, quote, create/cancel/status and financial reconciliation all pass before activation

## 10. Architecture and data changes

Retain the modular monolith. A rewrite into microservices would add deployment and consistency work before demand is proven.

Add explicit records for Collection, ListingVersion, Asset, PackageManifest, LicenseVersion, ReviewDecision, Entitlement, Operation, OutboxJob, ReconciliationRun, GenerationBudget and UsageReservation. These are proposed conceptual records; the team should map them onto the current schema rather than duplicate existing equivalents.

An order item must snapshot the listing version, asset/license references, price and fee-policy version. An external effect must have a unique business-operation key, payload hash, attempt history and observed provider receipt. Store immutable events and separately maintain current projections.

### Money operation state

REQUESTED → PROCESSING → CONFIRMED, FAILED or UNKNOWN. A worker crash expires its lease and triggers safe reconciliation. UNKNOWN blocks further conflicting effects. An idempotency key helps, but does not replace the state machine or local ledger uniqueness constraints.

Refunds and transfers must be modeled as separate operations with linked reconciliation. Provider responses, webhook duplicates, out-of-order events, network timeouts and DB failures are normal inputs to test. Do not describe a three-column ledger as fully reconciled solely because sequential sums match.

### Asset pipeline

Upload to quarantine → inspect actual bytes → verify ownership → scan/validate → create private canonical asset → derive public preview → assemble package manifest → human review → publish immutable version. Signed links are a delivery mechanism, not the entire entitlement model.

### Observability

Track request/operation IDs, provider latency, retry counts, failed jobs, payment mismatches, generation cost, storage use and support cases. Redact secrets, addresses and tokens. Give the operator one dashboard with actionable exceptions, not only GMV charts.

## 11. Economics and pricing

The current fee configuration is $3/month plus 8% of item value, with estimated standard processing of 2.9% + $0.30 passed through. The $29 shirt example yields $2.32 platform commission. That is revenue, not profit.

The business model needs separate lines for payment processing, Connect account/payout charges, Billing, AI, storage/egress, tax tooling, refunds, unrecovered seller debt, support labor, moderation, samples, acquisition and fixed software. Cash held for sellers is not platform revenue or working capital to spend freely.

Stripe's public US pricing for platforms handling their own pricing lists $2 per monthly active account and 0.25% + $0.25 per payout sent. Applicability depends on the actual account configuration and agreement. A transfer to a connected account and a payout from that account to a bank are different events; do not multiply the bank-payout fee by every order without evidence. [Stripe Connect pricing](https://stripe.com/us/connect/pricing)

### Transparent scenario math

At $20 average item value, 8% produces $1.60 per order; 15% produces $3.00. A $100 monthly fixed-cost assumption therefore needs at least 63 or 34 orders respectively if all variable costs are unrealistically zero. Actual break-even is higher. This is a sensitivity calculation, not a sales forecast or a recommendation to change live prices now.

Four generated images at an assumed $0.05, $0.20 or $0.50 each cost $0.20, $0.80 or $2.00 per batch. These are hypothetical unit-cost scenarios, not quoted model prices. Thirty batches would cost $6, $24 or $60 before copywriting and infrastructure. A rate limit alone does not make a $3 subscription viable.

For POD, the seller may need to pay production and shipping before Synthora releases the sales proceeds. Ten copies of the existing $12.82 production-plus-shipping example require $128.20 of seller funding during that gap, before tax or other costs. Printful describes billing the seller for fulfillment after orders arrive. “No inventory” does not mean “no cash requirement.” [Printful billing](https://help.printful.com/hc/en-us/articles/50264607936785-How-does-the-Printful-billing-system-work)

### Pricing recommendation to test

For the invited digital pilot, test no fixed monthly fee and a clearly disclosed 15% commission, with processing treatment spelled out and generation excluded. This is a proposal requiring founder approval and seller consent, not an implemented change. Compare creator acceptance and contribution margin with the existing $3 + 8% offer. A lower fee has little value if the platform brings no demand.

Never advertise profitable seller earnings using production-only arithmetic. Show estimated contribution before income tax and creator labor, the payout timing, and any assumptions.

## 12. Validation plan and decision gates

### Gate A: problem and offer

Interview ten target buyers about their last relevant purchase, where they searched, what they rejected, actual spending and printing/format friction. Show actual candidate collections and alternatives; ask them to choose, not to compliment the concept. Interview five creators about packaging effort, distribution and acceptable economics.

Proceed only if at least five buyers identify a concrete use and several choose a specific offered collection at the proposed price without coaching. These are directional discovery criteria, not statistical proof. If nobody wants the files, change the offer before polishing infrastructure.

### Gate B: safe unpaid prototype

Ten observed end-to-end usability sessions, including mobile and guest flows. Require at least eight participants to correctly explain what arrives, allowed use, price and next step. Every confusion about physical versus digital must be fixed. Use demo payments only.

### Gate C: limited paid pilot

Only after all P0 launch gates pass and the founders approve a cash/time cap. Aim for 20 fulfilled paid orders from at least ten independent buyers, across more than one creator and source of traffic. Record all visits, failures, refunds and support time. Founder purchases, test cards and subsidized transactions do not count as demand evidence.

Provisional engineering target: at least 95% of valid paid digital orders receive the correct entitlement within one minute; every exception is visible and resolved. Zero unresolved money discrepancies or cross-account access defects. At least eight of the first ten interviewed buyers should say the delivered package matched its description. These small-sample targets are operating gates, not population estimates.

### Gate D: expand or stop

Expand only after contribution is positive under observed variable costs and a plausible labor allocation, buyers can be acquired repeatably without unbounded founder effort, and quality remains dependable. If traffic is low, demand is unknown; if qualified people repeatedly decline the offer, investigate the offer. Do not label missing traffic “product failure,” and do not label a few friendly purchases product-market fit.

If distribution is the persistent blocker, narrow the audience or test creator software with explicit willingness to pay. Do not respond by generating thousands of listings.

## 13. Metrics with exact definitions

**North-star candidate:** fulfilled, non-refunded orders from independent buyers who received the promised package. Report the observation window and refund-lag caveat.

- Visitor conversion = paid orders / eligible unique storefront visitors; deduplicate tests and bots
- Checkout completion = paid checkout sessions / initiated checkout sessions; separate payment failures
- Buyer comprehension = participants correctly identifying product/format/license / observed participants
- Creator activation = invited creators publishing an approved collection / accepted invitations
- Quality = faulty/not-as-described orders / fulfilled orders, with counts and lag
- Contribution = platform revenue minus attributable variable cash costs; report founder labor separately and in a labor-adjusted view
- Acquisition efficiency = attributable acquisition cost and time / first-time independent buyers; do not call organic traffic free
- Reliability = unresolved financial operations, entitlement latency and failed jobs by age
- Retention = repeat purchase by buyer cohort and time window; low-frequency art buying makes short-window retention hard to interpret
- Supply health = sales concentration, approved-to-submitted ratio and time to first independent sale

Log product_viewed, collection_saved if added, checkout_started, payment_confirmed, entitlement_issued, download_succeeded, support_opened, refund_confirmed and review_submitted. Associate events with privacy-safe IDs and the correct product version. Never count a button click as confirmed payment.

## 14. Roadmap by evidence, not calendar promises

**Stage 0 - Align:** owners, use case, budget, pricing hypothesis, legal review and source ownership. Readiness matrix replaces unsupported green checkmarks.

**Stage 1 - Secure the foundation:** identity/guest access, storage isolation, digital studio sequencing, environment profiles and durable money operations. Each fix has a negative test.

**Stage 2 - Curated prototype:** collection/version/manifest workflow, previews, useful discovery and operator review. Conduct the unpaid sessions.

**Stage 3 - Paid digital pilot:** approved territories/tax, real-provider verification, money reconciliation, support ownership and incident controls. Collect the finite demand evidence.

**Stage 4 - One sampled physical product:** only if buyer demand supports it. Verify one POD provider and the complete production/cancellation/refund chain. Fund samples and reserves explicitly.

**Stage 5 - Selective expansion:** more creators, formats or countries one at a time, chosen from buyer evidence. Studio subscriptions and commercial licensing are separate product decisions.

These are sequencing recommendations. No launch date, spending or account change is authorized by this document.

## 15. QA and release checklist

- Identity: unverified email, duplicate registration, privilege escalation, guest attachment, session expiry and account recovery
- Ownership: cross-seller asset IDs, forged URLs, altered generation IDs, deleted assets and purchased version retention
- Files: wrong MIME, deceptive extensions, corrupt archives, oversized uploads, missing private bucket, expired links and revoked access
- Payments: duplicate/out-of-order events, asynchronous payment, delayed actual fees, timeouts, crash after external success, partial refunds and concurrent refunds
- Payouts: new dispute/suspension during release, crash after claim, successful transfer before DB failure, reversal failure and negative balance
- Fulfillment: missing configuration, live/mock mismatch, mutable listing after purchase, stale quotes and unknown external-order result
- UI: 360px, keyboard, focus, light/dark contrast, double clicks, refresh/back, pending state, empty state, error and retry
- Operations: backup restore, alert ownership, secret rotation procedure, safe migrations, reconciliation and incident shutdown

Add end-to-end browser coverage and provider test-mode receipts. Preserve existing unit/contract tests, but do not describe stubbed request-shape tests as completed real-provider acceptance.

## 16. Legal, trust and founder decisions

Obtain qualified review for marketplace responsibilities, sales tax/VAT, refund terms, privacy, IP handling, seller onboarding and reserves. Stripe separate charges/transfers can place fees, refunds and chargebacks on the platform balance; enabling Connect does not remove that exposure. [Stripe funds-flow documentation](https://docs.stripe.com/connect/separate-charges-and-transfers)

AI output is not automatically protected by copyright. The US Copyright Office distinguishes human-authored contributions from machine-generated expression. Commercial-use permission from an AI provider, copyrightability, third-party infringement and exclusivity are separate questions. Avoid promises that the platform cannot substantiate. [US Copyright Office report](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)

The repository has no root license file in the inspected tree, and the design brief references the Webflow Fre template. Confirm ownership and permitted reuse of code, design assets and that template before launch or redistribution. Public visibility alone does not establish an open-source license. Confirm the Synthora name/domain/trademark position; no clearance was performed here.

Founder decisions needed: accountable product owner, engineering owner, moderation/support owner and backup; ownership/contributor agreement; maximum cash and weekly-time commitment; chosen pilot niche; seller fee treatment; accepted territories; go/no-go authority. Do not infer these from GitHub access or assign Griffin/Grady a role they have not accepted.

## 17. Better ideas worth testing later

- A “fits your room” collection finder based on palette, ratio and intended space, without pretending that matching colors proves purchase intent
- A visible package manifest and quality receipt as a practical trust feature
- Creator process stories with separate self-declared and platform-recorded evidence
- Buyer-requested collections fulfilled by reviewed creators, only after demand and privacy controls justify the workflow
- One-click reformatting for supported print ratios, subject to human crop review and pixel requirements
- Creator analytics showing which collection pages convert and which file/printing questions cause friction
- A controlled printable-to-physical upgrade for already popular collections, after sample and cost validation

Defer generative social feeds, token incentives, speculative marketplace currencies, paid seller ranking, broad agent swarms and unsupported “copyright-safe” guarantees. They increase scope before solving discovery and trust.

## 18. Bottom line

The best next move is to make a small number of products worth buying and make each transaction reliable. Preserve the existing implementation, reduce the first launch's scope, fix the concrete safety and money-flow gaps, and test whether real buyers choose the offer. If the evidence is weak, change the proposition before building a larger marketplace.

## Repository evidence map

All paths resolve under https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/

- docs/PRD.md, README.md: existing product scope, prices, demo claims and known launch gaps
- docs/ARCHITECTURE.md, docs/DESIGN.md: architecture and visual/template provenance
- src/app/actions/auth.ts, src/auth.ts, src/server/session.ts: registration, login, guest-order attachment and admin authority
- src/app/seller/listings/new/ai/AiWizard.tsx, src/app/seller/listings/new/actions.ts, src/server/listings.ts: digital flow, validation and asset ownership
- src/lib/storage.ts, src/app/api/uploads/presign/route.ts, src/app/api/download/[itemId]/route.ts: storage and entitlements
- src/server/orders.ts, payouts.ts, refunds.ts, stripe-webhooks.ts, fulfillment.ts: payment side effects and recovery
- src/server/studio.ts, src/ai/image/openai.ts, src/lib/env.ts: generation costs, dimensions and service modes
- src/config/fees.ts, src/lib/fees.ts, src/lib/payments/stripe.ts: fee model and funds flow
- prisma/schema.prisma, tests/*.test.ts, tests/support/*: schema and existing verification surface
- src/app/page.tsx, src/app/shop/page.tsx, src/app/l/[slug]/page.tsx, src/app/checkout/CheckoutForm.tsx: buyer journey and current supported-country UI

External sources were checked October 5, 2026. Proposed metrics, prices, samples and budget scenarios are planning assumptions, not observed performance. This document does not modify the repository or authorize spending, deployment or live transactions.


---

# Synthora: remediation and execution plan

October 5, 2026 • Proposed plan • Read-only review of main at e7cba70411ef22061fdf27884815943f3abf1403

Synthora is a separate marketplace product. This plan does not change CleverdayDesign, reuse its approvals, treat its sales as Synthora demand, or authorize changes to either storefront. The companion PRD describes the long-term platform and a narrow first-market hypothesis. Category choice remains a founder decision informed by buyer research.

## The product we are advancing

A curated AI-native marketplace where people can discover distinctive finished goods, understand the creator's process and know exactly what they will receive. AI assistance is visible. Product quality, useful curation and reliable transactions are the buyer promise.

Build the platform around four durable capabilities:

1. **Useful discovery:** collections organized by buyer intent, use, style and format
2. **Credible product records:** creator identity, separate provenance evidence, checked files/specifications and honest previews
3. **Reliable commerce:** verified payments, versioned delivery, reconciled refunds and payouts
4. **Creator distribution:** bring qualified buyers and give creators evidence about what sells

The generation studio is a supporting feature. Its existence does not solve marketplace demand or justify unlimited generation costs.

## What the visuals show

- **Product blueprint:** the buyer/creator/operator experience and the evidence loop
- **Remediation map:** urgent risks, the controls that resolve them and the release dependency chain
- **Roadmap:** how the broad vision becomes a small validated pilot, then expands

All proposed elements are labeled. Existing code is not shown as production-verified. No app code, account, pricing or deployment was changed during this review.

## 1. Stop/go rules

Do not open real checkout until the identity, storage, money recovery, production-mode and legal/tax blockers below pass. Continue demo-mode product and usability work while those fixes are underway. Do not delete the existing multi-provider code; disable unqualified capabilities at the boundary.

Every ticket needs: owner, source commit, acceptance test, failure case, migration/rollback plan if applicable, evidence link and reviewer. “Implemented” and “verified” are separate statuses. A screenshot is not proof of financial correctness; a unit-test pass is not proof that an external provider accepts the integration.

## 2. P0 remediation tickets

### SYN-001 — Prove account ownership before linking orders or granting authority

**Files:** src/app/actions/auth.ts; src/auth.ts; src/server/session.ts; prisma/schema.prisma

**Observed:** password signup immediately links guest orders by the supplied email. Administrative access also accepts an ADMIN_EMAILS match. No mailbox verification gate was found in that path.

**Change:** introduce verified ownership before linking prior orders; provision admins explicitly; require stronger admin authentication; bind privilege changes to audit events. Preserve legitimate guest access through scoped purchase tokens while verification is incomplete.

**Acceptance:** an unverified claimant cannot view another email's orders, claim its downloads or gain an admin role. Verify session expiry, recovery, duplicate-account and email-change behavior. Confirm existing users are migrated without indiscriminately granting verified status.

### SYN-002 — Complete the digital studio state transition

**Files:** src/app/seller/listings/new/ai/AiWizard.tsx; src/app/seller/listings/new/actions.ts; src/server/listings.ts

**Observed:** the wizard sends a null digital asset; schema validation requires the asset before the intended conversion executes.

**Change:** represent a generation draft explicitly, materialize the deliverable, validate ownership and file manifest, then run publication validation. A failed conversion leaves an editable draft, not a broken public listing.

**Acceptance:** digital generate → preview → save draft → resume → submit → approved publication → test purchase → download succeeds; missing/corrupt files and wrong-owner generation references fail safely. The browser cannot manufacture readiness fields.

### SYN-003 — Separate originals, previews and purchased versions

**Files:** src/lib/storage.ts; src/app/api/uploads/presign/route.ts; src/server/studio.ts; src/app/api/download/[itemId]/route.ts; schema

**Observed:** private storage falls back to the public bucket; generated originals are publicly stored; downloads reference the listing's current asset.

**Change:** fail closed on missing private storage; use owned asset records; derive public previews from private originals; make purchased asset/license versions immutable; introduce upload quarantine and byte-level checks.

**Acceptance:** direct public access to protected originals fails; replacing a listing asset does not silently replace a past purchase; unsigned/expired/wrong-account downloads fail; actual storage policy is tested in the approved test environment.

### SYN-004 — Make paid orders recover after crashes

**Files:** src/server/orders.ts; src/server/fulfillment.ts; src/server/stripe-webhooks.ts; src/lib/email.ts; schema

**Observed:** PAID is committed before downstream notification and dispatch, while a retry can return alreadyPaid without repairing those obligations.

**Change:** write durable obligations in the same transaction as paid state; workers claim jobs through leases and use stable operation keys. The operator can distinguish pending, retryable, unknown and failed operations.

**Acceptance:** kill/restart at each boundary around payment acknowledgement, notification and fulfillment; every committed paid order eventually receives its intended fulfillment/entitlement once, or has a visible unresolved incident. Retry does not create a duplicate partner order.

### SYN-005 — Reconcile transfers and refunds before final status

**Files:** src/server/payouts.ts; src/server/refunds.ts; src/server/ledger.ts; src/lib/payments/stripe.ts; schema

**Observed:** payout state is claimed as PAID before the external transfer. Refunds/reversals have multiple external and local steps without a durable reconciliation state.

**Change:** add explicit processing/unknown states and durable receipts; prevent conflicting concurrent money operations; recheck disputes/suspensions at execution time; enforce unique ledger operation keys. Reconcile externally successful/local failed operations before retrying.

**Acceptance:** no missing or duplicate transfer after crash/restart; partial/refund/dispute races retain correct balances; unknown results block affected payouts; failed reversal creates an explicit receivable or approved loss treatment rather than a false recovery claim.

### SYN-006 — Reconcile actual fees and seller debt

**Files:** src/server/orders.ts; src/server/refunds.ts; src/server/sellers.ts; src/config/fees.ts; src/lib/fees.ts

**Observed:** actual-fee lookup failure falls back to an estimate. Automatic negative-balance recovery is acknowledged as missing, while a notification promises future deduction.

**Change:** preserve estimated versus actual status, reconcile actual fees, version fee policies, track seller receivables and implement the approved offset/reserve policy. Match notifications and legal copy to behavior.

**Acceptance:** delayed fee information adjusts the correct seller shares once; cumulative partial refunds cannot return more commission than originally charged; later payouts respect approved debt treatment; every difference has an explanation.

### SYN-007 — Enforce coherent production profiles

**Files:** src/lib/env.ts; fulfillment registry; mock routes; seed/setup/deployment configuration

**Observed:** service modes are independently selected from key presence; real payment does not alone prove real fulfillment or secure storage.

**Change:** explicit DEMO/TEST/LIVE capability profiles; startup/readiness checks; disabled provider flags; no mock or seeded identities in live commerce; secrets remain outside source and logs.

**Acceptance:** every missing/mixed configuration combination is rejected or visibly quarantined. Live checkout cannot submit to a mocked partner or grant an entitlement into public fallback storage. Readiness is checked on the deployment that will take payments.

### SYN-008 — Settle launch responsibilities and supported territory

**Inputs:** docs/PRD.md; src/content/legal.tsx; checkout country list; provider agreements and actual account configuration

**Change:** founders approve seller/buyer territory, tax treatment, refund/support policy, platform liability/reserves, code/design ownership and a bounded cash/time commitment. Obtain appropriate legal/accounting review. Remove UI destinations that exceed approved scope.

**Acceptance:** configuration, legal copy, seller disclosures and actual operations agree. No “tax later” assumption, unlimited guarantee or fake production certification.

## 3. P1 tickets before growth

### SYN-009 — Meter generation and uploads

Reserve usage atomically before expensive calls; authorize approved accounts; set concurrency, daily and platform caps; log actual cost; handle failures/cancellation. Copy generation needs controls too. Disable generation in the first paid pilot if metering is not ready. No unlimited allowance hidden inside a $3 subscription.

### SYN-010 — Replace loose ownership checks

Use server-owned asset/generation records rather than URL substring matching. Verify the requesting seller owns each object. Validate destination hosts and fetch limits for any server retrieval. Post-upload verification must check actual bytes, sizes and allowed content, not just browser declarations.

### SYN-011 — Freeze fulfillment specifications

Save the sale-time design hash, product and variant identity, supported print area, quote, tax/shipping assumptions and price policy. A seller editing a listing after payment cannot change what gets produced. If physical products launch, add stock/reservation tests and physical sample acceptance.

### SYN-012 — Turn quality into a product feature

Add Collection/ListingVersion, PackageManifest, LicenseVersion and ReviewDecision where existing equivalents are absent. Enforce technical checks and human approval. Distinguish creator declarations, platform generation receipts, package checks and human review. Display useful facts rather than a broad “verified” badge.

### SYN-013 — Instrument the actual funnel

Record qualified visitors, checkout starts, confirmed payments, entitlement success, refunds, support and independent repeat buyers. Deduplicate retries and exclude founder/test traffic. Record cash costs and operator time. Do not optimize signup or listing count while buyer completion is unknown.

### SYN-014 — Close browser and incident gaps

Add end-to-end coverage for mobile, keyboard, failed/pending operations, refresh/back, double-submit and repeated login. Test backup restoration, dead-letter queues and alert ownership. Existing mock contract tests remain valuable but do not replace these checks.

## 4. Dependencies and implementation order

1. Agree acceptance criteria, preserve baseline and create isolated test data
2. SYN-001, SYN-002, SYN-003 and SYN-007 can proceed independently with clear file ownership
3. Design shared operation/ledger contracts before SYN-004, SYN-005 and SYN-006 overlap
4. Resolve SYN-008 in parallel; it remains a release gate even if the code is complete
5. Add SYN-009 through SYN-014 according to the selected pilot scope
6. Integrate once, run aggregate tests against the final commit, then perform approved provider test-mode verification
7. Conduct unpaid usability sessions; real payments require the complete release gate and founder approval

This is an execution order, not an instruction to launch more agents. The requested review and artifacts were prepared by dot directly.

## 5. How to advance the business

### First: make the offer precise

Choose one buyer, one job and one first product family. Curated printable art collections are a low-fulfillment-complexity hypothesis; a sampled physical-print collection is an alternative if buyers prefer it. A broad “AI products for everyone” launch is too difficult to interpret.

Compare three actual offer pages with ten qualified buyers. Ask about their last purchase, what they would choose today, what would stop them and whether they understand the deliverable. Preserve negative feedback. Do not use a leading “Would you use an AI marketplace?” question as demand evidence.

### Second: seed quality, not volume

Recruit roughly five invited creators and review approximately 20 complete collections. Confirm they are willing to supply, maintain and support them at the proposed economics. Do not scrape, copy or flood the catalog. Name the person responsible for resolving product defects.

### Third: prove acquisition

Choose a narrowly relevant creator/community channel and a buyer-intent search/content channel. Get permission for outreach and spend separately. Attribute traffic and record founder time. A creator's audience is a starting route, not proof that Synthora has an independent marketplace advantage.

### Fourth: run a finite pilot

After the P0 gates: 20 fulfilled orders from at least ten independent buyers is an initial operating-learning target. Count all visits and failures. Evaluate whether contribution remains positive after generation, payments, support and refund costs. Low traffic means insufficient demand evidence; repeated rejection by qualified buyers calls for changing the offer.

### Fifth: earn expansion

Add one physical product/provider only after sample, catalog, money and support evidence. Add another category only when the current one has a repeatable acquisition route. Introduce subscriptions only after recurring creator value is demonstrated. The broad marketplace remains the destination, not the starting launch scope.

## 6. Founder decisions to make now

- Which buyer/job is the first test, and what evidence would change that choice?
- Who owns product, engineering, support/moderation and financial reconciliation?
- What code/design rights and contributor agreement cover Grady and Griffin?
- What maximum cash and weekly-time commitment is acceptable before the pilot gate?
- Which seller economics will be tested, including generation and payment costs?
- Which territory/tax setup is approved, and who signs off on launch?

No date should force release while a P0 remains open. A prepared plan is not a completed remediation. The next best action is to approve a narrow offer test and the P0 ticket set, then verify each change with its own receipt.


---

# Synthora source review receipt

Snapshot: main at e7cba70411ef22061fdf27884815943f3abf1403; retrieved October 5, 2026.

## Coverage and limits

The complete Git tree contained 182 blobs. All retrieved local bytes matched their expected Git blob hashes. The review included a repository-wide text inventory and detailed review of product, architecture, identity, listing, storage, payments, fulfillment, pricing and test-boundary paths. The lockfile and remaining presentation/configuration files were inventoried structurally; this is not a claim of line-by-line verification of every dependency or generated visual.

No source package was installed or executed. No project tests, migrations, seed, deployment, account writes or purchases were run. Static findings require isolated regression reproduction and review before closure. Repository documentation assertions about passing tests or accessibility were not promoted to new observed results.

## Exact evidence pointers

### SYN-001
- [src/app/actions/auth.ts, line 40](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/app/actions/auth.ts#L40)
- [src/server/session.ts, line 18](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/session.ts#L18)

### SYN-002
- [src/app/seller/listings/new/ai/AiWizard.tsx, line 184](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/app/seller/listings/new/ai/AiWizard.tsx#L184)
- [src/server/listings.ts, line 62](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/listings.ts#L62)
- [src/app/seller/listings/new/actions.ts, line 49](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/app/seller/listings/new/actions.ts#L49)

### SYN-003
- [src/lib/storage.ts, line 33](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/lib/storage.ts#L33)
- [src/app/api/uploads/presign/route.ts, line 34](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/app/api/uploads/presign/route.ts#L34)
- [src/server/studio.ts, line 22](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/studio.ts#L22)

### SYN-004
- [src/server/orders.ts, line 107](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/orders.ts#L107)
- [src/server/orders.ts, line 29](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/orders.ts#L29)
- [src/server/fulfillment.ts, line 288](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/fulfillment.ts#L288)

### SYN-005
- [src/server/payouts.ts, line 73](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/payouts.ts#L73)
- [src/server/refunds.ts, line 45](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/refunds.ts#L45)

### SYN-006
- [src/server/orders.ts, line 42](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/orders.ts#L42)
- [src/server/refunds.ts, line 79](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/server/refunds.ts#L79)

### SYN-007
- [src/lib/env.ts, line 44](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/lib/env.ts#L44)

### SYN-009
- [src/app/seller/listings/new/actions.ts, line 28](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/app/seller/listings/new/actions.ts#L28)
- [src/ai/image/openai.ts, line 21](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/ai/image/openai.ts#L21)

### SYN-010
- [src/app/seller/listings/new/actions.ts, line 54](https://github.com/griffinfeldt-oss/synthora/blob/e7cba70411ef22061fdf27884815943f3abf1403/src/app/seller/listings/new/actions.ts#L54)

## Deliverable status

The PRD, remediation tickets and diagrams are proposals. They have not been applied to Synthora or to Etsy. The diagram colors group responsibilities and risk; they do not certify that any proposed control exists.

Prepared directly by dot; no product research or authoring subagents were used.
