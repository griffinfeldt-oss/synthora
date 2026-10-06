/**
 * Every fee, rate and hold window the marketplace uses lives here.
 * Change a number in this file and the checkout, payouts, seller calculator,
 * pricing page and tests all follow.
 *
 * Money is integer cents. Rates are basis points (1% = 100 bps).
 */
export const FEES = {
  /**
   * Bump this whenever a number below changes. Every order records the version
   * it was placed under, so old orders keep the terms they were sold on.
   */
  version: "2026-10-01",
  currency: "usd",

  /** Seller plan, billed through Stripe Billing. */
  subscription: {
    monthlyCents: 300,
    productName: "Synthora seller plan",
    /** Listings pause (never delete) while the plan is in one of these states. */
    pauseListingsWhen: ["PAST_DUE", "UNPAID", "CANCELED", "INCOMPLETE"] as const,
  },

  /** Platform commission on each sale. */
  commission: {
    rateBps: 800,
    /** Shipping is passed through to the seller's partner, so no commission on it. */
    appliesToShipping: false,
  },

  /**
   * Card processing, passed through to the seller at cost.
   * At checkout we only know an estimate; once Stripe reports the real fee on the
   * charge's balance transaction we use that and split it across sellers by their
   * share of the charge.
   */
  processing: {
    rateBps: 290,
    fixedCents: 30,
    label: "Card processing (Stripe, at cost)",
  },

  /** When a seller's money is released after a sale. */
  payoutHold: {
    /** Days after the carrier marks a parcel delivered (buyer can release sooner by confirming). */
    daysAfterDelivered: 7,
    /** Digital goods: days after payment. */
    digitalDays: 3,
    /** Safety net: release this many days after shipping even if no "delivered" scan arrives. */
    daysAfterShippedWithoutDelivery: 30,
  },

  refunds: {
    /** On a refund, the platform gives back the commission it kept on the refunded amount. */
    returnCommission: true,
    /** Stripe does not return its processing fee on refunds; it stays with the seller (at cost). */
    processingFeeReturned: false,
    /**
     * If money cannot be pulled back from a seller who was already paid (their
     * Stripe balance is empty), it is recorded as a debt and taken from their next
     * payouts. Sellers are told exactly this; see src/server/refunds.ts.
     */
    recoverDebtFromFuturePayouts: true,
  },

  listing: {
    minPriceCents: 100,
    maxPriceCents: 500_000,
  },
} as const;

export type FeeConfig = typeof FEES;
