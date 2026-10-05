import Link from "next/link";
import type { Metadata } from "next";
import { FEES } from "@/config/fees";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { requireSeller } from "@/server/session";
import { sellerBalances } from "@/server/payouts";
import { Button, EmptyState, Notice, Pill, Stat, Table } from "@/components/ui";
import { billingPortalAction, startPlanAction, stripeDashboardAction } from "../actions";
import { PayoutStatusPill } from "../orders/StatusPill";

export const metadata: Metadata = { title: "Earnings & billing" };
export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const { seller } = await requireSeller();
  const [balances, payouts, orders, planCharges] = await Promise.all([
    sellerBalances(seller.id),
    db.payout.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 50, include: { sellerOrder: { include: { order: true } } } }),
    db.sellerOrder.findMany({ where: { sellerId: seller.id, order: { paidAt: { not: null } } }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } }),
    db.ledgerEntry.findMany({ where: { sellerId: seller.id, type: "SUBSCRIPTION", account: "PLATFORM" }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const planOk = seller.subscriptionStatus === "ACTIVE";

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Held until delivery" value={formatMoney(balances.heldCents)} />
        <Stat label="Ready to pay out" value={formatMoney(balances.eligibleCents)} hint="Sent daily" />
        <Stat label="Paid out" value={formatMoney(balances.paidCents)} />
        <Stat label="Refunded to buyers" value={formatMoney(balances.refundedCents)} />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-[20px]">Seller plan</h2>
            <Pill tone={planOk ? "ok" : "danger"}>{seller.subscriptionStatus.replace("_", " ").toLowerCase()}</Pill>
          </div>
          <p className="mt-2 text-[14px] text-muted">
            {formatMoney(FEES.subscription.monthlyCents)}/month{seller.currentPeriodEnd && planOk ? `, renews ${formatDate(seller.currentPeriodEnd)}` : ""}.{" "}
            {!planOk && seller.subscriptionStatus !== "NONE" ? "Your listings are paused until the plan is paid. Nothing has been deleted." : ""}
          </p>
          <form action={seller.subscriptionStatus === "NONE" ? startPlanAction : billingPortalAction} className="mt-4">
            <Button size="sm" variant={planOk ? "secondary" : "primary"}>
              {seller.subscriptionStatus === "NONE" ? "Start plan" : planOk ? "Manage billing" : "Update card & pay"}
            </Button>
          </form>
          {planCharges.length ? (
            <ul className="mt-4 space-y-1 text-[13px] text-muted">
              {planCharges.slice(0, 4).map((c) => (
                <li key={c.id}>
                  {formatDate(c.createdAt)} · {formatMoney(c.amountCents)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="border border-line bg-surface p-5">
          <h2 className="font-serif text-[20px]">Payout account</h2>
          <p className="mt-2 text-[14px] text-muted">
            {seller.payoutsEnabled ? "Stripe Express account ready. Transfers land in your bank on Stripe's payout schedule." : "Finish Stripe onboarding to receive payouts."}
          </p>
          {seller.stripeAccountId ? (
            <form action={stripeDashboardAction} className="mt-4">
              <Button size="sm" variant="secondary">
                Open Stripe dashboard
              </Button>
            </form>
          ) : (
            <Link href="/seller/onboarding" className="mt-4 inline-block text-[14px] font-semibold underline">
              Set up payouts
            </Link>
          )}
        </div>
      </section>

      <Notice title="How payouts work">
        After each sale we keep the {FEES.commission.rateBps / 100}% commission and pass on Stripe&apos;s card fee at cost. The rest is held until the buyer confirms delivery or{" "}
        {FEES.payoutHold.daysAfterDelivered} days after tracking shows delivered ({FEES.payoutHold.digitalDays} days for digital files), then transferred to your Stripe account. Your partner (Printify, Printful, Gelato) bills you
        directly for production.
      </Notice>

      <section>
        <h2 className="mb-3 font-serif text-[24px]">Earnings by order</h2>
        {orders.length ? (
          <Table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Gross</th>
                <th>Commission</th>
                <th>Processing</th>
                <th>Refunds</th>
                <th>Net</th>
                <th>Partner bill (est.)</th>
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
                  <td>{formatMoney(so.itemsCents + so.shippingCents)}</td>
                  <td>−{formatMoney(so.commissionCents)}</td>
                  <td>−{formatMoney(so.processingFeeCents)}</td>
                  <td>{so.refundedCents ? `−${formatMoney(so.refundedCents)}` : "—"}</td>
                  <td className="font-semibold">{formatMoney(so.netCents)}</td>
                  <td>{so.partnerCostCents ? formatMoney(so.partnerCostCents) : "—"}</td>
                  <td>
                    <PayoutStatusPill status={so.payoutStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No sales yet" />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-[24px]">Transfers</h2>
        {payouts.length ? (
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Transfer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{p.sellerOrder.order.number}</td>
                  <td>
                    {formatMoney(p.amountCents)}
                    {p.reversedCents ? <span className="text-muted"> (−{formatMoney(p.reversedCents)} reversed)</span> : null}
                  </td>
                  <td className="font-mono text-[12.5px]">{p.stripeTransferId ?? "—"}</td>
                  <td>
                    <Pill tone={p.status === "PAID" ? "ok" : p.status === "FAILED" ? "danger" : "neutral"}>{p.status.toLowerCase()}</Pill>
                    {p.failureReason ? <p className="mt-1 text-[12px] text-danger">{p.failureReason}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No transfers yet">Your first payout is sent after your first order is delivered.</EmptyState>
        )}
      </section>
    </div>
  );
}
