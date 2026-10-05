import Link from "next/link";
import { AiChip } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { ListingVisual, type VisualImage } from "./ListingVisual";

export interface CardListing {
  slug: string;
  title: string;
  priceCents: number;
  aiTool: string;
  productType: string;
  kind: string;
  images: VisualImage[];
  seller?: { shopName: string } | null;
}

/** Fre-style product card: image, centred serif name, light serif price, plus the AI disclosure. */
export function ProductCard({ listing }: { listing: CardListing }) {
  const [first, second] = listing.images;
  return (
    <Link href={`/l/${listing.slug}`} className="group block focus-visible:outline-offset-4">
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        <ListingVisual image={first} productTypeId={listing.productType} className="absolute inset-0 transition-opacity duration-300" />
        {second ? (
          <ListingVisual
            image={second}
            productTypeId={listing.productType}
            variant={1}
            className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
        ) : null}
        <div className="absolute left-2.5 top-2.5 sm:left-3 sm:top-3">
          <AiChip tool={listing.aiTool} className="bg-surface/95" />
        </div>
        {listing.kind === "DIGITAL" ? (
          <span className="absolute bottom-3 left-3 rounded-[2px] bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">Instant download</span>
        ) : null}
      </div>
      <div className="px-1 pt-4 text-center sm:px-2">
        <h3 className="font-serif text-[16px] leading-snug text-ink group-hover:underline sm:text-[18px]">{listing.title}</h3>
        {listing.seller ? <p className="mt-0.5 text-[12.5px] text-muted">by {listing.seller.shopName}</p> : null}
        <p className="mt-1 font-serif text-[19px] text-muted sm:text-[21px]">{formatMoney(listing.priceCents)}</p>
      </div>
    </Link>
  );
}

export function ProductGrid({ listings, cols = 3 }: { listings: CardListing[]; cols?: 2 | 3 | 4 }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <ul className={`grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 ${grid} max-[380px]:grid-cols-1`}>
      {listings.map((l) => (
        <li key={l.slug}>
          <ProductCard listing={l} />
        </li>
      ))}
    </ul>
  );
}
