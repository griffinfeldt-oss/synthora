/**
 * Stripe Tax product tax codes (docs.stripe.com/tax/tax-codes). They decide how
 * each line is taxed in each state, so confirm them during the legal and tax review.
 * Stripe Tax only collects where the platform has an active registration.
 */
import { productType } from "./catalog";

export const TAX = {
  apparel: "txcd_30011000", // Clothing & Footwear: exempt or reduced in some states
  physicalGoods: "txcd_99999999", // General - Tangible Goods (prints, mugs, stickers, cases…)
  digitalGoods: "txcd_10505001", // Digital Finished Artwork - downloaded - permanent rights
  shipping: "txcd_92010001", // Shipping
} as const;

export function taxCodeForListing(listing: { kind: string; productType: string }): string {
  if (listing.kind === "DIGITAL") return TAX.digitalGoods;
  return productType(listing.productType).category === "apparel" ? TAX.apparel : TAX.physicalGoods;
}
