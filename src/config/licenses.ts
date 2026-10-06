/**
 * Licences offered with digital files. Each change ships as a new version; a
 * buyer's entitlement keeps the version they bought. Seeded into LicenseVersion.
 *
 * These are plain-language drafts for legal review (see the launch gates), not
 * legal advice. They promise no exclusivity and make no copyright guarantee.
 */
export interface LicenseDef {
  id: string;
  key: string;
  version: number;
  name: string;
  summary: string;
  body: string;
  commercial: boolean;
}

export const LICENSES: LicenseDef[] = [
  {
    id: "personal-v1",
    key: "personal",
    version: 1,
    name: "Personal use",
    commercial: false,
    summary: "Print it, frame it, use it at home or as a wallpaper. Not for resale or business use.",
    body: [
      "You may: download the file, print it for yourself or as a gift, and display it in your home or personal spaces.",
      "You may not: sell or give away the file or prints of it, use it in products, logos or marketing, or claim you made it.",
      "Not exclusive: the seller may sell the same design to others.",
      "AI-made work may have limited or no copyright protection. The seller confirmed they have the right to sell it; Synthora does not guarantee originality.",
    ].join("\n\n"),
  },
  {
    id: "small-business-v1",
    key: "small-business",
    version: 1,
    name: "Personal and small business use",
    commercial: true,
    summary: "Everything in personal use, plus use in your own business: up to 500 printed items and your own marketing.",
    body: [
      "You may: everything allowed under Personal use; use the design in your own business's marketing and decor; and make up to 500 physical items that include it.",
      "You may not: resell, share or sublicense the file itself; use it as a logo or trademark; or use it in templates or products where the file can be extracted.",
      "Not exclusive: the seller may sell the same design to others.",
      "AI-made work may have limited or no copyright protection. The seller confirmed they have the right to sell it; Synthora does not guarantee originality.",
    ].join("\n\n"),
  },
];

export const DEFAULT_LICENSE_KEY = "personal";

export function latestLicense(key: string): LicenseDef {
  const versions = LICENSES.filter((l) => l.key === key).sort((a, b) => b.version - a.version);
  return versions[0] ?? LICENSES[0];
}
