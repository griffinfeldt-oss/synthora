import Link from "next/link";
import type { Metadata } from "next";
import type { SellerStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Button, Input, Pill, Table } from "@/components/ui";
import { sellerStatusAction } from "../actions";

export const metadata: Metadata = { title: "Sellers · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminSellers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status } = await searchParams;
  const sellers = await db.seller.findMany({
    where: status ? { status: status as SellerStatus } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { email: true } }, _count: { select: { listings: true, sellerOrders: true } }, partners: { where: { status: "ACTIVE" }, select: { provider: true, mock: true } } },
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-4 font-serif text-[24px]">Sellers</h2>
        {["", "PENDING", "APPROVED", "SUSPENDED"].map((s) => (
          <Link key={s} href={s ? `/admin/sellers?status=${s}` : "/admin/sellers"} className={`border px-3 py-1 text-[13px] font-semibold ${status === s || (!status && !s) ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>
            {s ? s.toLowerCase() : "all"}
          </Link>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            <th>Shop</th>
            <th>Setup</th>
            <th>Activity</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => (
            <tr key={s.id}>
              <td>
                <p className="font-semibold">{s.shopName}</p>
                <p className="text-[12.5px] text-muted">
                  {s.user.email} · joined {formatDate(s.createdAt)}
                </p>
                {s.bio ? <p className="mt-1 max-w-sm text-[12.5px] text-muted">{s.bio}</p> : null}
              </td>
              <td className="text-[13px]">
                <p>Payouts: {s.payoutsEnabled ? "✓" : "—"}</p>
                <p>Plan: {s.subscriptionStatus.toLowerCase()}</p>
                <p>Partners: {s.partners.map((p) => p.provider + (p.mock ? " (demo)" : "")).join(", ") || "—"}</p>
              </td>
              <td className="text-[13px]">
                {s._count.listings} listings
                <br />
                {s._count.sellerOrders} orders
              </td>
              <td>
                <Pill tone={s.status === "APPROVED" ? "ok" : s.status === "SUSPENDED" ? "danger" : "warn"}>{s.status.toLowerCase()}</Pill>
                {s.statusReason ? <p className="mt-1 text-[12px] text-muted">{s.statusReason}</p> : null}
              </td>
              <td>
                <form action={sellerStatusAction} className="flex min-w-[220px] flex-col gap-2">
                  <input type="hidden" name="sellerId" value={s.id} />
                  {s.status !== "APPROVED" ? (
                    <Button size="sm" name="status" value="APPROVED">
                      {s.status === "SUSPENDED" ? "Reinstate" : "Approve"}
                    </Button>
                  ) : (
                    <>
                      <Input name="reason" placeholder="Reason for suspension" aria-label="Reason" className="h-9 text-[13px]" />
                      <Button size="sm" variant="danger" name="status" value="SUSPENDED">
                        Suspend
                      </Button>
                    </>
                  )}
                  {s.status === "APPROVED" ? (
                    <Link href={`/s/${s.slug}`} className="text-[12.5px] underline">
                      View shop
                    </Link>
                  ) : null}
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
