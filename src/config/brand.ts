/**
 * Brand name and contact details in one place.
 * Set NEXT_PUBLIC_SITE_DOMAIN once you own a domain; every email address and
 * example link follows it.
 */
const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN || "synthora.market";

export const BRAND = {
  name: "Synthora",
  tagline: "Goods made with AI, labeled honestly",
  domain,
  supportEmail: `help@${domain}`,
  privacyEmail: `privacy@${domain}`,
  /** Prefix for human-readable order numbers, e.g. SYN-261005-7KQ4X. */
  orderPrefix: "SYN",
  /** Name of the built-in demo image model, shown as the AI tool on listings it makes. */
  studioName: "Synthora Studio",
} as const;
