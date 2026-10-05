import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { searchListings } from "@/server/listings";
import { ProductGrid } from "@/components/product/ProductCard";
import { Container, EmptyState, PageBand, Stars } from "@/components/ui";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = await db.seller.findUnique({ where: { slug: (await params).slug } });
  return { title: s?.shopName ?? "Shop" };
}

export default async function SellerShopPage({ params }: { params: Params }) {
  const seller = await db.seller.findUnique({ where: { slug: (await params).slug } });
  if (!seller || seller.status !== "APPROVED") notFound();
  const [{ items, total }, rating, tools] = await Promise.all([
    searchListings({ sellerId: seller.id, sort: "popular" }),
    db.review.aggregate({ where: { listing: { sellerId: seller.id }, status: "VISIBLE" }, _avg: { rating: true }, _count: true }),
    db.listing.groupBy({ by: ["aiTool"], where: { sellerId: seller.id, status: "ACTIVE" } }),
  ]);
  return (
    <>
      <div className="pt-6">
        <PageBand title={seller.shopName} sub={seller.bio ?? undefined}>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[13px] text-band-muted">
            {seller.location ? <span>{seller.location}</span> : null}
            <span>{total} listings</span>
            {rating._count ? (
              <span className="[&_*]:text-band-muted">
                <Stars value={rating._avg.rating ?? 0} count={rating._count} />
              </span>
            ) : null}
            {tools.length ? <span>Uses {tools.map((t) => t.aiTool).join(", ")}</span> : null}
          </div>
        </PageBand>
      </div>
      <Container className="mt-14">
        {items.length ? <ProductGrid listings={items} /> : <EmptyState title="No listings yet" />}
      </Container>
    </>
  );
}
