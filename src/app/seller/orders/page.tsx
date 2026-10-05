import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { requireSeller } from "@/server/session";
import { EmptyState, Table } from "@/components/ui";
import { PayoutStatusPill, SellerOrderStatus } from "./StatusPill";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "", label: "All" },
  { id: "ship", label: "To ship" },
  { id: "action", label: "Action needed" },
  { id: "transit", label: "In progress" },
  { id: "done", label: "Done" },
];

export default async function SellerOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { seller } = await requireSeller();
  const { filter = "" } = await searchParams;
  const where: Prisma.SellerOrderWhereInput = { sellerId: seller.id, status: { not: "PENDING" } };
  if (filter === "ship") where.fulfillments = { some: { provider: "self", status: "PENDING" } };
  if (filter === "action") where.status = "ACTION_NEEDED";
  if (filter === "transit") where.status = { in: ["PAID", "IN_PRODUCTION", "SHIPPED"] };
  if (filter === "done") where.status = { in: ["DELIVERED", "COMPLETED", "REFUNDED", "CANCELED"] };
  const orders = await db.sellerOrder.findMany({ where, orderBy: { createdAt: "desc" }, include: { order: true, items: true }, take: 100 });
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-[24px]">Orders</h2>
      <nav aria-label="Order filters" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.id} href={f.id ? `/seller/orders?filter=${f.id}` : "/seller/orders"} aria-current={filter === f.id ? "page" : undefined} className={`border px-3 py-1.5 text-[13px] font-semibold ${filter === f.id ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink"}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      {orders.length ? (
        <Table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Items</th>
              <th>Gross</th>
              <th>Your net</th>
              <th>Status</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((so) => (
              <tr key={so.id}>
                <td>
                  <Link href={`/seller/orders/${so.id}`} className="font-semibold underline">
                    {so.order.number}
                  </Link>
                </td>
                <td>{formatDate(so.createdAt)}</td>
                <td className="max-w-[220px] truncate">{so.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}</td>
                <td>{formatMoney(so.itemsCents + so.shippingCents)}</td>
                <td>{formatMoney(so.netCents)}</td>
                <td>
                  <SellerOrderStatus status={so.status} />
                </td>
                <td>
                  <PayoutStatusPill status={so.payoutStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No orders here" />
      )}
    </div>
  );
}
