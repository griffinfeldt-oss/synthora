import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/session";
import { signOutAction } from "@/app/actions/auth";
import { Button, ButtonLink, Container, EmptyState, PageBand, Pill, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

const ORDER_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  FULFILLING: "On its way",
  COMPLETED: "Complete",
  CANCELED: "Canceled",
  PARTIALLY_REFUNDED: "Partly refunded",
  REFUNDED: "Refunded",
  DISPUTED: "Disputed",
};

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [orders, notifications] = await Promise.all([
    db.order.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" }, include: { items: true } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return (
    <>
      <div className="pt-6">
        <PageBand title={`Hi, ${user.name?.split(" ")[0] ?? "there"}`} sub={user.email} />
      </div>
      <Container className="mt-12 grid gap-12 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="orders-title">
          <h2 id="orders-title" className="mb-4 font-serif text-[26px]">
            Your orders
          </h2>
          {orders.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="font-semibold underline">
                        {o.number}
                      </Link>
                    </td>
                    <td>{formatDate(o.createdAt)}</td>
                    <td className="max-w-[260px] truncate">{o.items.map((i) => i.title).join(", ")}</td>
                    <td>{formatMoney(o.totalCents)}</td>
                    <td>
                      <Pill tone={o.status === "COMPLETED" ? "ok" : o.status === "FULFILLING" ? "signal" : "neutral"}>{ORDER_LABEL[o.status] ?? o.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No orders yet" action={<ButtonLink href="/shop">Start shopping</ButtonLink>} />
          )}
        </section>
        <aside className="space-y-8">
          <section aria-labelledby="notes-title">
            <h2 id="notes-title" className="mb-3 font-serif text-[22px]">
              Updates
            </h2>
            {notifications.length ? (
              <ul className="divide-y divide-line border border-line bg-surface">
                {notifications.map((n) => (
                  <li key={n.id} className="p-4">
                    <p className="text-[14px] font-semibold">{n.href ? <Link href={n.href} className="hover:underline">{n.title}</Link> : n.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{n.body}</p>
                    <p className="mt-1 text-[12px] text-muted">{formatDateTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">Nothing yet.</p>
            )}
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="font-serif text-[20px]">{user.seller ? user.seller.shopName : "Sell on Latent.Market"}</h2>
            <p className="mt-1 text-[14px] text-muted">{user.seller ? "Manage listings, orders and payouts." : "Open a shop for $3 a month. List in minutes with AI."}</p>
            <ButtonLink href={user.seller ? "/seller" : "/sell"} variant="secondary" size="sm" className="mt-4">
              {user.seller ? "Seller dashboard" : "Learn more"}
            </ButtonLink>
          </section>
          <form action={signOutAction}>
            <Button variant="ghost" size="sm" className="px-0 underline">
              Sign out
            </Button>
          </form>
        </aside>
      </Container>
    </>
  );
}
