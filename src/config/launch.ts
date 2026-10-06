/**
 * What is switched on, where Synthora sells, and the sign-offs that must exist
 * before real money moves.
 *
 * The defaults keep today's full marketplace. The October 2026 product review
 * (docs/reviews/2026-10-05-complete-review.md) recommends a narrower first pilot;
 * each switch notes the pilot setting. Changing them is a founder decision.
 */
export const LAUNCH = {
  /** "invite" requires an invite code to open a shop (pilot: "invite"). */
  sellerSignup: "open" as "open" | "invite",

  /** Which kinds of listing can be created and sold (pilot: DIGITAL only). */
  listingKinds: { PARTNER: true, SELF_SHIP: true, DIGITAL: true } as Record<"PARTNER" | "SELF_SHIP" | "DIGITAL", boolean>,

  /** Print partners sellers may connect (pilot: none until one is sampled and verified). */
  providers: { printify: true, printful: true, gelato: true } as Record<string, boolean>,

  /** Allow one checkout to contain several sellers (pilot: false). */
  multiSellerCheckout: true,

  /** "Make one with AI". Also needs a configured image model in live mode. */
  generationStudio: true,

  moderation: {
    /** Every new listing and every material edit waits for a human reviewer. */
    requireReview: true,
  },

  /**
   * Where buyers can have orders delivered and where sellers can be based.
   * Sales tax is not calculated yet, so only add countries once a tax decision covers them.
   */
  territory: {
    buyerCountries: ["US"] as string[],
    sellerCountries: ["US"] as string[],
  },

  /**
   * Launch gates. Each one records who approved what, and when (for example
   * "Sales tax: Stripe Tax for US states where registered. Approved by <name>, 2026-11-02").
   * APP_MODE=live refuses to start while any of them is empty.
   */
  gates: {
    taxPolicy: null as string | null,
    territory: "United States only: buyers and sellers. Approved by Griffin Feldt, 2026-10-05" as string | null,
    legalReview: null as string | null,
    refundPolicy:
      "Buyers get the published Returns & problems policy; anything outside it is decided case by case by the support owner. Approved by Griffin Feldt, 2026-10-05" as string | null,
    /** Whether part of each seller's earnings is held back against refunds and chargebacks. */
    reservePolicy: null as string | null,
    supportOwner: "Griffin Feldt; backup: Grady. Approved by Griffin Feldt, 2026-10-05" as string | null,
    reconciliationOwner: "Griffin Feldt; backup: Grady. Approved by Griffin Feldt, 2026-10-05" as string | null,
  },

  /** Limits on AI generation so cost is bounded and attributable. */
  ai: {
    /** Kill switch: set AI_STUDIO_ENABLED=false to stop all generation immediately. */
    enabled: process.env.AI_STUDIO_ENABLED !== "false",
    /** Only approved shops with an active plan may generate. */
    requireActiveSeller: true,
    batchesPerSellerPerHour: 10,
    batchesPerSellerPerDay: 40,
    concurrentBatchesPerSeller: 1,
    copyPerSellerPerHour: 30,
    /** Platform-wide daily ceiling on estimated AI spend. */
    platformDailyBudgetCents: 2_000,
    /** Planning estimates, not quoted prices: set them from your provider's current rates. */
    estImageCostCents: 5,
    estCopyCostCents: 1,
    /** A provider call slower than this is canceled and the budget released. */
    timeoutMs: 90_000,
  },
};

export type LaunchConfig = typeof LAUNCH;

export function providerEnabled(id: string): boolean {
  if (id === "self") return LAUNCH.listingKinds.SELF_SHIP;
  if (id === "digital") return LAUNCH.listingKinds.DIGITAL;
  return LAUNCH.listingKinds.PARTNER && LAUNCH.providers[id] !== false;
}

export function missingGates(): string[] {
  return Object.entries(LAUNCH.gates)
    .filter(([, v]) => !v || !String(v).trim())
    .map(([k]) => k);
}
