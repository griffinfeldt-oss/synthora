import Link from "next/link";
import type { Metadata } from "next";
import type { ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ListingVisual } from "@/components/product/ListingVisual";
import { Button, Input, Pill, Table } from "@/components/ui";
import { listingModerationAction } from "../actions";

export const metadata: Metadata = { title: "Listings · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminListings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status, q } = await searchParams;
  const listings = await db.listing.findMany({
    where: {
      ...(status ? { status: status as ListingStatus } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { seller: { shopName: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { seller: { select: { shopName: true, status: true } }, images: { orderBy: { position: "asc" }, take: 1 }, _count: { select: { reports: true } } },
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-4 font-serif text-[24px]">Listings</h2>
        {["", "ACTIVE", "PAUSED_BILLING", "SUSPENDED", "REMOVED", "DRAFT"].map((s) => (
          <Link key={s} href={s ? `/admin/listings?status=${s}` : "/admin/listings"} className={`border px-3 py-1 text-[13px] font-semibold ${status === s || (!status && !s) ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>
            {s ? s.replace("_", " ").toLowerCase() : "all"}
          </Link>
        ))}
        <form className="ml-auto" action="/admin/listings">
          <Input name="q" defaultValue={q} placeholder="Search title or shop" aria-label="Search listings" className="h-9 w-56 text-[13px]" />
        </form>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Listing</th>
            <th>Disclosure</th>
            <th>Price</th>
            <th>Status</th>
            <th>Moderate</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.id}>
              <td>
                <div className="flex gap-3">
                  <div className="relative size-14 shrink-0 overflow-hidden bg-surface-2">
                    <ListingVisual image={l.images[0]} productTypeId={l.productType} className="absolute inset-0" />
                  </div>
                  <div>
                    <Link href={`/l/${l.slug}`} className="font-semibold underline">
                      {l.title}
                    </Link>
                    <p className="text-[12.5px] text-muted">
                      {l.seller.shopName}
                      {l.seller.status !== "APPROVED" ? ` (shop ${l.seller.status.toLowerCase()})` : ""}
                    </p>
                    {l._count.reports ? <Pill tone="warn">{l._count.reports} report(s)</Pill> : null}
                  </div>
                </div>
              </td>
              <td className="max-w-xs text-[12.5px]">
                <p className="font-semibold">{l.aiTool} · {l.aiInvolvement === "FULL" ? "fully AI" : "AI + edits"}</p>
                <p className="line-clamp-3 text-muted">{l.howMade}</p>
                <p className="text-muted">Rights confirmed: {l.rightsConfirmedAt ? "yes" : "no"}</p>
              </td>
              <td>{formatMoney(l.priceCents)}</td>
              <td>
                <Pill tone={l.status === "ACTIVE" ? "ok" : ["SUSPENDED", "REMOVED"].includes(l.status) ? "danger" : "neutral"}>{l.status.replace("_", " ").toLowerCase()}</Pill>
              </td>
              <td>
                <form action={listingModerationAction} className="flex min-w-[200px] flex-col gap-2">
                  <input type="hidden" name="listingId" value={l.id} />
                  {l.status === "SUSPENDED" || l.status === "REMOVED" ? (
                    <Button size="sm" variant="secondary" name="action" value="restore">
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Input name="reason" placeholder="Reason" aria-label="Reason" className="h-9 text-[13px]" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" name="action" value="suspend">
                          Suspend
                        </Button>
                        <Button size="sm" variant="danger" name="action" value="remove">
                          Remove
                        </Button>
                      </div>
                    </>
                  )}
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
