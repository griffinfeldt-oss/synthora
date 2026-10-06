import Link from "next/link";
import type { Metadata } from "next";
import type { SellerStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { LAUNCH } from "@/config/launch";
import { ActionForm } from "@/components/ActionForm";
import { Button, Input, Pill, Table } from "@/components/ui";
import { createInviteAction, sellerStatusAction } from "../actions";

export const metadata: Metadata = { title: "Sellers · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminSellers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status } = await searchParams;
  const sellers = await db.seller.findMany({
    where: status ? { status: status as SellerStatus } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { email: true, emailVerified: true } }, _count: { select: { listings: true, sellerOrders: true } }, partners: { where: { status: "ACTIVE" }, select: { provider: true, mock: true } } },
  });
  const invites = await db.sellerInvite.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
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
                  {s.user.email} {s.user.emailVerified ? "(confirmed)" : "(email not confirmed)"} · joined {formatDate(s.createdAt)}
                  {s.isTest ? " · demo shop" : ""}
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

      <section className="space-y-3 border border-line bg-surface p-5">
        <h3 className="font-serif text-[20px]">Seller invites</h3>
        <p className="text-[13.5px] text-muted">
          Seller signup is <strong>{LAUNCH.sellerSignup === "invite" ? "invite-only" : "open"}</strong> (src/config/launch.ts). Codes work once; one tied to an email only works for that account.
        </p>
        <ActionForm action={createInviteAction} submitLabel="Create invite code" size="sm" variant="secondary" className="flex flex-wrap items-end gap-3 space-y-0">
          <Input name="email" type="email" placeholder="Creator's email (optional)" aria-label="Creator email" className="h-9 w-64" />
          <Input name="note" placeholder="Note (optional)" aria-label="Note" className="h-9 w-48" />
        </ActionForm>
        {invites.length ? (
          <ul className="space-y-1 text-[13.5px]">
            {invites.map((i) => (
              <li key={i.id}>
                <code>{i.code}</code> {i.email ? `· ${i.email}` : ""} · {i.usedAt ? `used ${formatDate(i.usedAt)}` : "unused"}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
