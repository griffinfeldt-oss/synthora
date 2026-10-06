# Metric definitions

What the Admin → Funnel page counts, and how. Unless "include test traffic" is
on, every count excludes:

- test-mode and demo events (`isTest`: any order or event not in `APP_MODE=live`)
- staff and seeded accounts, and sellers viewing their own listings (`isInternal`)
- obvious bots by user agent (`isBot`)

Small numbers are operating signals, not statistics. Report the time window
with every number.

## North star

**Fulfilled, unrefunded orders from independent buyers.** Paid live orders that
reached COMPLETED with no refund, from buyers who are not staff or seeded
accounts. Refunds can arrive weeks later, so recent windows overstate it.

## Funnel

| Metric | Definition | Source |
|---|---|---|
| Unique visitors | Distinct visitor ids (first-party `syn_aid` cookie) with a `product_viewed` event | `AnalyticsEvent` |
| Visitor conversion | `payment_confirmed` events ÷ unique visitors | events |
| Checkout completion | `payment_confirmed` ÷ `checkout_started` (a started checkout is one created order) | events |
| Repeat buyers | Buyers (by email) with more than one paid order in the window | `Order` |
| Quality | Faulty or not-as-described refunds ÷ fulfilled orders (count both) | refunds + support |
| Contribution | Platform revenue − attributable variable cash costs (card fees the platform bears, AI spend, storage, refunds not recovered, samples). Report founder time separately. | ledger + AI usage |

`payment_confirmed` is written only from a verified payment (signed Stripe
event with the right amount), never from a button click.

## Events

| Event | When |
|---|---|
| `product_viewed` | A listing page renders |
| `checkout_started` | An order is created and sent to Stripe |
| `payment_confirmed` | `markOrderPaid` commits a verified payment |
| `entitlement_issued` | A paid digital item's download right is issued |
| `download_succeeded` | The download route hands out a signed link |
| `support_opened` | "Get help with this order" is used |
| `refund_confirmed` | A refund is recorded after Stripe confirms it |
| `review_submitted` | A buyer leaves a review |

Events carry the listing version where relevant, so results can be tied to
what was actually on sale.

## Operations

| Metric | Target (provisional, from the review) |
|---|---|
| Paid → download ready (p95) | under 60 seconds |
| Unresolved money operations | zero older than a few hours |
| Failed jobs that gave up | zero unowned |
| Reconciliation differences | zero unexplained |
