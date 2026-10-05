import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { requireSeller } from "@/server/session";
import { onboardingState } from "@/server/sellers";
import { sellerBalances } from "@/server/payouts";
import { ButtonLink, EmptyState, Notice, Pill, Stat, Table } from "@/components/ui";
import { SellerOrderStatus } from "./orders/StatusPill";

export const metadata: Metadata = { title: "Seller dashboard" };
export const dynamic = "force-dynamic";

export default async function SellerHome() {
  const { seller } = await requireSeller();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [state, balances, monthSales, needsShipping, failed, recent, activeListings] = await Promise.all([
    onboardingState(seller),
    sellerBalances(seller.id),
    db.sellerOrder.aggregate({ where: { sellerId: seller.id, order: { paidAt: { gte: monthStart } } }, _sum: { itemsCents: true }, _count: true }),
    db.fulfillment.count({ where: { sellerOrder: { sellerId: seller.id, status: { in: ["PAID", "IN_PRODUCTION"] } }, provider: "self", status: "PENDING" } }),
    db.fulfillment.count({ where: { sellerOrder: { sellerId: seller.id }, status: "FAILED" } }),
    db.sellerOrder.findMany({ where: { sellerId: seller.id, status: { not: "PENDING" } }, orderBy: { createdAt: "desc" }, take: 6, include: { order: true, items: true } }),
    db.listing.count({ where: { sellerId: seller.id, status: "ACTIVE" } }),
  ]);

  return (
    <div className="space-y-8">
      {!state.canPublish ? (
        <Notice tone="warn" title="Finish setting up to sell">
          {state.missing.join(" · ")}.{" "}
          <Link href="/seller/onboarding" className="font-semibold underline">
            Open the checklist
          </Link>
        </Notice>
      ) : null}
      {seller.subscriptionStatus !== "ACTIVE" && seller.subscriptionStatus !== "NONE" ? (
        <Notice tone="danger" title="Your listings are paused">
          The monthly plan payment failed. <Link href="/seller/payouts" className="font-semibold underline">Update billing</Link> to put them back in the shop.
        </Notice>
      ) : null}
      {failed > 0 ? (
        <Notice tone="danger" title={`${failed} partner order${failed > 1 ? "s need" : " needs"} your attention`}>
          A partner rejected an order. <Link href="/seller/orders?filter=action" className="font-semibold underline">Fix or refund</Link>.
        </Notice>
      ) : null}
      {needsShipping > 0 ? (
        <Notice tone="signal" title={`${needsShipping} order${needsShipping > 1 ? "s" : ""} to ship`}>
          <Link href="/seller/orders?filter=ship" className="font-semibold underline">Add tracking</Link> once they're posted.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales this month" value={formatMoney(monthSales._sum.itemsCents ?? 0)} hint={`${monthSales._count} orders`} />
        <Stat label="Held until delivery" value={formatMoney(balances.heldCents)} hint="Released after the hold window" />
        <Stat label="Ready to pay out" value={formatMoney(balances.eligibleCents)} hint="Sent on the next daily run" />
        <Stat label="Paid out" value={formatMoney(balances.paidCents)} hint={`${activeListings} live listings`} />
      </div>

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="font-serif text-[24px]">
            Recent orders
          </h2>
          <Link href="/seller/orders" className="text-[13px] font-semibold underline">
            All orders
          </Link>
        </div>
        {recent.length ? (
          <Table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Items</th>
                <th>Your net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((so) => (
                <tr key={so.id}>
                  <td>
                    <Link href={`/seller/orders/${so.id}`} className="font-semibold underline">
                      {so.order.number}
                    </Link>
                  </td>
                  <td>{formatDate(so.createdAt)}</td>
                  <td className="max-w-[240px] truncate">{so.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}</td>
                  <td>{formatMoney(so.netCents)}</td>
                  <td>
                    <SellerOrderStatus status={so.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No orders yet" action={<ButtonLink href="/seller/listings/new">Create a listing</ButtonLink>}>
            Share your shop link to get your first sale.
          </EmptyState>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link href="/seller/listings/new/ai" className="group border border-line bg-surface p-6 hover:border-ink">
          <Pill tone="signal">Fastest</Pill>
          <h3 className="mt-3 font-serif text-[22px] group-hover:underline">Make one with AI</h3>
          <p className="mt-1 text-[14px] text-muted">Describe it in plain words, pick from four designs, see the mockup, publish.</p>
        </Link>
        <Link href="/seller/listings/new/own" className="group border border-line bg-surface p-6 hover:border-ink">
          <Pill>Your files</Pill>
          <h3 className="mt-3 font-serif text-[22px] group-hover:underline">List my own</h3>
          <p className="mt-1 text-[14px] text-muted">Digital downloads, things you ship yourself, or your own artwork on a partner product.</p>
        </Link>
      </section>
    </div>
  );
}
