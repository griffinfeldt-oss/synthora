import Link from "next/link";
import type { Metadata } from "next";
import { productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { findProvider } from "@/fulfillment/registry";
import { requireSeller } from "@/server/session";
import { ListingVisual } from "@/components/product/ListingVisual";
import { Button, ButtonLink, EmptyState, Notice, Pill, Table } from "@/components/ui";
import { listingStatusAction } from "../actions";

export const metadata: Metadata = { title: "Listings" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, "neutral" | "ok" | "warn" | "danger" | "signal"]> = {
  DRAFT: ["Draft", "neutral"],
  PENDING_REVIEW: ["In review", "warn"],
  ACTIVE: ["Live", "ok"],
  PAUSED: ["Paused", "neutral"],
  PAUSED_BILLING: ["Paused: billing", "warn"],
  SUSPENDED: ["Suspended", "danger"],
  REMOVED: ["Removed", "danger"],
};

export default async function SellerListings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { seller } = await requireSeller();
  const { error } = await searchParams;
  const listings = await db.listing.findMany({
    where: { sellerId: seller.id, NOT: { status: "REMOVED", statusReason: "Deleted by seller" } },
    orderBy: { createdAt: "desc" },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-[24px]">Listings</h2>
        <ButtonLink href="/seller/listings/new">New listing</ButtonLink>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {listings.length ? (
        <Table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Fulfillment</th>
              <th>Sales</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => {
              const [label, tone] = STATUS[l.status] ?? [l.status, "neutral"];
              return (
                <tr key={l.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden bg-surface-2">
                        <ListingVisual image={l.images[0]} productTypeId={l.productType} className="absolute inset-0" />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/seller/listings/${l.id}`} className="font-semibold hover:underline">
                          {l.title}
                        </Link>
                        <p className="text-[12.5px] text-muted">
                          {productType(l.productType).label} · {l.aiTool}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>{formatMoney(l.priceCents)}</td>
                  <td>{findProvider(l.provider)?.name ?? l.provider}</td>
                  <td>{l.salesCount}</td>
                  <td>
                    <Pill tone={tone}>{label}</Pill>
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {l.status === "ACTIVE" ? (
                        <form action={listingStatusAction}>
                          <input type="hidden" name="listingId" value={l.id} />
                          <input type="hidden" name="action" value="pause" />
                          <Button size="sm" variant="secondary">
                            Pause
                          </Button>
                        </form>
                      ) : l.status === "PAUSED" || l.status === "DRAFT" ? (
                        <form action={listingStatusAction}>
                          <input type="hidden" name="listingId" value={l.id} />
                          <input type="hidden" name="action" value="activate" />
                          <Button size="sm" variant="secondary">
                            Publish
                          </Button>
                        </form>
                      ) : null}
                      <Link href={`/l/${l.slug}`} className="inline-flex h-9 items-center px-2 text-[13px] font-semibold underline">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No listings yet" action={<ButtonLink href="/seller/listings/new">Create your first listing</ButtonLink>}>
          It takes about two minutes with AI.
        </EmptyState>
      )}
    </div>
  );
}
