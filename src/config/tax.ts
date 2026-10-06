/**
 * Stripe Tax product classifications. These are starting categories for the
 * storefront; confirm them against the actual items before live launch.
 * Stripe Tax only collects where the platform has an active registration.
 */
export const TAX = {
  physicalGoods: "txcd_99999999", // General tangible goods
  digitalGoods: "txcd_10000000", // General electronically supplied services
  shipping: "txcd_92010001", // Shipping
} as const;

export function taxCodeForListing(kind: string): string {
  return kind === "DIGITAL" ? TAX.digitalGoods : TAX.physicalGoods;
}
