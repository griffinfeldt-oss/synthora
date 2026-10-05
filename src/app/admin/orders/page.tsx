import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { Input, Pill, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Orders · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { filter, q } = await searchParams;
  const where: Prisma.OrderWhereInput = {};
  if (filter === "failed") where.sellerOrders = { some: { status: "ACTION_NEEDED" } };
  if (filter === "disputed") where.disputes = { some: { status: "OPEN" } };
  if (filter === "refunded") where.refundedCents = { gt: 0 };
  if (q) where.OR = [{ number: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  const orders = await db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { sellerOrders: { include: { seller: { select: { shopName: true } } } } } });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-4 font-serif text-[24px]">Orders</h2>
        {[
          ["", "all"],
          ["failed", "partner failed"],
          ["disputed", "disputed"],
          ["refunded", "refunded"],
        ].map(([f, label]) => (
          <Link key={f} href={f ? `/admin/orders?filter=${f}` : "/admin/orders"} className={`border px-3 py-1 text-[13px] font-semibold ${filter === f || (!filter && !f) ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>
            {label}
          </Link>
        ))}
        <form className="ml-auto" action="/admin/orders">
          <Input name="q" defaultValue={q} placeholder="Order number or email" aria-label="Search orders" className="h-9 w-56 text-[13px]" />
        </form>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Buyer</th>
            <th>Sellers</th>
            <th>Total</th>
            <th>Refunded</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/admin/orders/${o.id}`} className="font-semibold underline">
                  {o.number}
                </Link>
                <p className="text-[12px] text-muted">{formatDateTime(o.createdAt)}</p>
              </td>
              <td className="text-[13px]">{o.email}</td>
              <td className="text-[13px]">{o.sellerOrders.map((s) => s.seller.shopName).join(", ")}</td>
              <td>{formatMoney(o.totalCents)}</td>
              <td>{o.refundedCents ? formatMoney(o.refundedCents) : "—"}</td>
              <td>
                <Pill tone={o.status === "COMPLETED" ? "ok" : o.status === "DISPUTED" ? "danger" : "neutral"}>{o.status.replaceAll("_", " ").toLowerCase()}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
