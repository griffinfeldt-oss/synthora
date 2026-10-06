/**
 * Pure fee and payout math. No I/O, so it is easy to test (tests/fees.test.ts).
 * All amounts are integer cents.
 */
import { FEES, type FeeConfig } from "@/config/fees";

/** Round half away from zero, to the nearest cent. */
export function roundCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function bps(amountCents: number, rateBps: number): number {
  return roundCents((amountCents * rateBps) / 10_000);
}

export function commissionFor(
  itemsCents: number,
  shippingCents = 0,
  config: FeeConfig = FEES,
): number {
  const base = itemsCents + (config.commission.appliesToShipping ? shippingCents : 0);
  return bps(base, config.commission.rateBps);
}

/** Stripe's standard card fee for a single charge. */
export function estimateProcessingFee(chargeCents: number, config: FeeConfig = FEES): number {
  if (chargeCents <= 0) return 0;
  return bps(chargeCents, config.processing.rateBps) + config.processing.fixedCents;
}

/**
 * Split `total` into integer parts proportional to `weights`, using the largest
 * remainder method so the parts always add up to exactly `total`.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Nothing to weigh by: give it all to the first part.
    return weights.map((_, i) => (i === 0 ? total : 0));
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    floored[order[k].i] += 1;
    remainder -= 1;
  }
  return floored;
}

export interface SellerShareInput {
  sellerId: string;
  itemsCents: number;
  shippingCents: number;
  /** Partner production cost; billed to the seller by the partner, never by us. */
  partnerCostCents: number;
  /** Part of `shippingCents` that partners bill the seller for (0 for self-ship and digital). */
  partnerShippingCents?: number;
}

export interface SellerShare extends SellerShareInput {
  grossCents: number;
  commissionCents: number;
  processingFeeCents: number;
  /** What the platform transfers to the seller's Stripe account. */
  netCents: number;
  /** Net minus the partner bill (production + the shipping the partner charges). */
  estimatedProfitCents: number;
}

export interface OrderSplit {
  totalCents: number;
  itemsCents: number;
  shippingCents: number;
  processingFeeCents: number;
  platformCommissionCents: number;
  sellers: SellerShare[];
}

/**
 * Split one buyer charge across sellers.
 * - Commission is charged per seller on their items.
 * - The processing fee (actual, or estimated from the total) is shared by each
 *   seller's share of the charge.
 * - Shipping collected goes to the seller, because their partner bills them for it.
 */
export function splitOrder(
  sellers: SellerShareInput[],
  options: { processingFeeCents?: number; config?: FeeConfig } = {},
): OrderSplit {
  const config = options.config ?? FEES;
  const gross = sellers.map((s) => s.itemsCents + s.shippingCents);
  const totalCents = gross.reduce((a, b) => a + b, 0);
  const processingFeeCents = options.processingFeeCents ?? estimateProcessingFee(totalCents, config);
  const feeParts = allocateProportionally(processingFeeCents, gross);

  const shares: SellerShare[] = sellers.map((s, i) => {
    const commissionCents = commissionFor(s.itemsCents, s.shippingCents, config);
    const netCents = gross[i] - commissionCents - feeParts[i];
    const partnerShippingCents = s.partnerShippingCents ?? 0;
    return {
      ...s,
      grossCents: gross[i],
      commissionCents,
      processingFeeCents: feeParts[i],
      netCents,
      estimatedProfitCents: netCents - s.partnerCostCents - partnerShippingCents,
    };
  });

  return {
    totalCents,
    itemsCents: sellers.reduce((a, s) => a + s.itemsCents, 0),
    shippingCents: sellers.reduce((a, s) => a + s.shippingCents, 0),
    processingFeeCents,
    platformCommissionCents: shares.reduce((a, s) => a + s.commissionCents, 0),
    sellers: shares,
  };
}

export interface EarningsPreview {
  buyerPaysCents: number;
  commissionCents: number;
  processingFeeCents: number;
  payoutCents: number;
  partnerBillCents: number;
  profitCents: number;
  marginPct: number;
}

/**
 * The live "you earn" math shown while a seller sets a price.
 * Assumes one unit in its own order (the worst case for the fixed card fee).
 */
export function previewEarnings(
  input: { priceCents: number; baseCostCents: number; shippingCents: number; partnerBillsShipping: boolean },
  config: FeeConfig = FEES,
): EarningsPreview {
  const buyerPaysCents = input.priceCents + input.shippingCents;
  const commissionCents = commissionFor(input.priceCents, input.shippingCents, config);
  const processingFeeCents = estimateProcessingFee(buyerPaysCents, config);
  const payoutCents = buyerPaysCents - commissionCents - processingFeeCents;
  const partnerBillCents = input.baseCostCents + (input.partnerBillsShipping ? input.shippingCents : 0);
  const profitCents = payoutCents - partnerBillCents;
  return {
    buyerPaysCents,
    commissionCents,
    processingFeeCents,
    payoutCents,
    partnerBillCents,
    profitCents,
    marginPct: input.priceCents > 0 ? Math.round((profitCents / input.priceCents) * 1000) / 10 : 0,
  };
}

/** Lowest price at which the seller makes at least `minProfitCents`. */
export function breakEvenPrice(
  input: { baseCostCents: number; shippingCents: number; partnerBillsShipping: boolean; minProfitCents?: number },
  config: FeeConfig = FEES,
): number {
  const target = input.minProfitCents ?? 0;
  for (let p = config.listing.minPriceCents; p <= config.listing.maxPriceCents; p += 1) {
    if (previewEarnings({ ...input, priceCents: p }, config).profitCents >= target) return p;
  }
  return config.listing.maxPriceCents;
}

export interface RefundImpact {
  refundCents: number;
  commissionReturnedCents: number;
  /** How much the seller's net goes down (and how much to pull back if already paid). */
  sellerDebitCents: number;
}

/**
 * Effect of refunding `refundCents` of one seller's part of an order.
 * The refund cannot exceed what is still unrefunded, and across any number of
 * partial refunds the commission returned never exceeds the commission charged
 * (the last refund returns exactly what is left).
 */
export function refundImpact(
  share: { grossCents: number; commissionCents: number; refundedCents: number; commissionReturnedCents?: number },
  refundCents: number,
  config: FeeConfig = FEES,
): RefundImpact {
  const refundable = share.grossCents - share.refundedCents;
  const amount = Math.max(0, Math.min(refundCents, refundable));
  const alreadyReturned = share.commissionReturnedCents ?? 0;
  const remainingCommission = Math.max(0, share.commissionCents - alreadyReturned);
  let commissionReturnedCents = 0;
  if (config.refunds.returnCommission && share.grossCents > 0 && amount > 0) {
    commissionReturnedCents =
      amount === refundable
        ? remainingCommission
        : Math.min(remainingCommission, roundCents((share.commissionCents * amount) / share.grossCents));
  }
  return {
    refundCents: amount,
    commissionReturnedCents,
    sellerDebitCents: amount - commissionReturnedCents,
  };
}

export interface HoldInput {
  kind: "physical" | "digital";
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  buyerConfirmedAt: Date | null;
  disputeOpen: boolean;
}

/**
 * When a seller's money for one order may be transferred, or null if not yet known.
 * Buyer confirmation releases immediately; otherwise we wait a set number of days
 * after delivery (or after payment for digital goods).
 */
export function payoutReleaseDate(input: HoldInput, config: FeeConfig = FEES): Date | null {
  if (!input.paidAt || input.disputeOpen) return null;
  if (input.buyerConfirmedAt) return input.buyerConfirmedAt;
  const day = 24 * 60 * 60 * 1000;
  if (input.kind === "digital") {
    return new Date(input.paidAt.getTime() + config.payoutHold.digitalDays * day);
  }
  if (input.deliveredAt) {
    return new Date(input.deliveredAt.getTime() + config.payoutHold.daysAfterDelivered * day);
  }
  if (input.shippedAt) {
    return new Date(input.shippedAt.getTime() + config.payoutHold.daysAfterShippedWithoutDelivery * day);
  }
  return null;
}
