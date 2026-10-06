import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { aiSpendToday } from "@/server/usage";
import { Stat, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Funnel · Admin" };
export const dynamic = "force-dynamic";

function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "–";
}

/**
 * Metric definitions are in docs/METRICS.md. Counts exclude test-mode and demo
 * traffic, staff and seeded accounts, and bots unless ?all=1.
 */
export default async function Funnel({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { all, days = "30" } = await searchParams;
  const since = new Date(Date.now() - Math.min(365, Math.max(1, Number(days) || 30)) * 86_400_000);
  const real = all ? {} : { isTest: false, isInternal: false, isBot: false };
  const count = (name: string) => db.analyticsEvent.count({ where: { name, createdAt: { gte: since }, ...real } });
  const [views, visitors, started, paid, entitled, downloads, refunds, reviews, ai] = await Promise.all([
    count("product_viewed"),
    db.analyticsEvent.findMany({ where: { name: "product_viewed", createdAt: { gte: since }, ...real, anonId: { not: null } }, distinct: ["anonId"], select: { anonId: true } }),
    count("checkout_started"),
    count("payment_confirmed"),
    count("entitlement_issued"),
    count("download_succeeded"),
    count("refund_confirmed"),
    count("review_submitted"),
    aiSpendToday(),
  ]);
  const paidOrders = await db.order.findMany({
    where: { paidAt: { gte: since }, ...(all ? {} : { mode: "live", buyer: { is: { isTest: false, role: "BUYER" } } }) },
    select: { email: true, totalCents: true, refundedCents: true, status: true, buyerId: true },
  });
  const independentBuyers = new Set(paidOrders.map((o) => o.email));
  const repeat = [...independentBuyers].filter((e) => paidOrders.filter((o) => o.email === e).length > 1).length;
  const delivered = paidOrders.filter((o) => o.status === "COMPLETED" && o.refundedCents === 0).length;

  // Operational: how fast paid digital orders got their entitlement.
  const ents = await db.entitlement.findMany({ where: { createdAt: { gte: since } }, include: { orderItem: { include: { order: { select: { paidAt: true } } } } }, take: 500 });
  const latencies = ents.map((e) => (e.orderItem.order.paidAt ? e.createdAt.getTime() - e.orderItem.order.paidAt.getTime() : 0)).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95) - (latencies.length > 1 ? 1 : 0)] : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-[24px]">Funnel</h2>
          <p className="max-w-2xl text-[14px] text-muted">
            Last {days} days. {all ? "Including test, staff and bot traffic." : "Real, independent traffic only: test mode, demo, staff, seeded accounts and bots are excluded."} Definitions: docs/METRICS.md.
          </p>
        </div>
        <Link href={all ? "/admin/funnel" : "/admin/funnel?all=1"} className="text-[13px] font-semibold underline">
          {all ? "Show real traffic only" : "Include test traffic"}
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="North star: fulfilled, unrefunded orders" value={delivered} hint="from independent buyers; refunds can lag" />
        <Stat label="Visitor conversion" value={pct(paid, visitors.length)} hint={`${paid} paid / ${visitors.length} unique visitors`} />
        <Stat label="Checkout completion" value={pct(paid, started)} hint={`${paid} paid / ${started} started`} />
        <Stat label="Repeat buyers" value={repeat} hint={`of ${independentBuyers.size} buyers`} />
      </div>
      <Table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Product pages viewed", views],
            ["Checkouts started", started],
            ["Payments confirmed (signed Stripe event)", paid],
            ["Download rights issued", entitled],
            ["Downloads", downloads],
            ["Refunds", refunds],
            ["Reviews", reviews],
          ].map(([k, v]) => (
            <tr key={k as string}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Paid-to-download-ready (p95)" value={p95 === null ? "–" : `${Math.round(p95 / 1000)} s`} hint="target: under 60 s" />
        <Stat label="AI spend today (estimate)" value={formatMoney(ai.cents)} hint={`${ai.batches} design batches`} />
        <Stat label="Paid order value" value={formatMoney(paidOrders.reduce((a, o) => a + o.totalCents - o.refundedCents, 0))} hint="net of refunds" />
      </div>
    </div>
  );
}
