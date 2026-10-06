import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env, mockSummary } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { ActionForm } from "@/components/ActionForm";
import { Pill, Stat, Table } from "@/components/ui";
import { runPayoutsAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

async function sum(where: Parameters<typeof db.ledgerEntry.aggregate>[0]["where"]) {
  return (await db.ledgerEntry.aggregate({ where, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
}

export default async function AdminHome() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [gmv, commission, commissionBack, subs, processing, held, eligible, paidOut, pendingSellers, openReports, openTakedowns, failed, disputes] = await Promise.all([
    sum({ type: "CHARGE", account: "CASH" }),
    sum({ type: "COMMISSION", account: "PLATFORM" }),
    sum({ type: "COMMISSION_REVERSAL", account: "PLATFORM" }),
    sum({ type: "SUBSCRIPTION", account: "PLATFORM" }),
    sum({ type: "PROCESSING_FEE", account: "CASH" }),
    db.sellerOrder.aggregate({ where: { payoutStatus: { in: ["HELD", "BLOCKED"] } }, _sum: { netCents: true } }),
    db.sellerOrder.aggregate({ where: { payoutStatus: "ELIGIBLE" }, _sum: { netCents: true } }),
    sum({ type: "PAYOUT", account: "CASH" }),
    db.seller.count({ where: { status: "PENDING" } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.takedownRequest.count({ where: { status: { in: ["RECEIVED", "COUNTER_NOTICE"] } } }),
    db.fulfillment.count({ where: { status: "FAILED" } }),
    db.dispute.count({ where: { status: "OPEN" } }),
  ]);
  const thisMonth = await sum({ type: "COMMISSION", account: "PLATFORM", createdAt: { gte: monthStart } });
  const [toReview, unknownOps, deadJobs, halted] = await Promise.all([
    db.listingVersion.count({ where: { status: "PENDING_REVIEW" } }),
    db.operation.count({ where: { status: { in: ["UNKNOWN", "PROCESSING"] }, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
    db.job.count({ where: { status: "DEAD" } }),
    db.seller.count({ where: { payoutsHaltedAt: { not: null } } }),
  ]);
  const services = mockSummary();

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 font-serif text-[22px]">Fees collected</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Commission (net of refunds)" value={formatMoney(commission + commissionBack)} hint={`${formatMoney(thisMonth)} this month`} />
          <Stat label="Seller plans" value={formatMoney(subs)} />
          <Stat label="Total platform revenue" value={formatMoney(commission + commissionBack + subs)} />
          <Stat label="Gross sales (GMV)" value={formatMoney(gmv)} hint={`Stripe fees passed through: ${formatMoney(-processing)}`} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-serif text-[22px]">Seller money</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Held for sellers" value={formatMoney(held._sum.netCents ?? 0)} />
          <Stat label="Due on next run" value={formatMoney(eligible._sum.netCents ?? 0)} />
          <Stat label="Transferred to sellers" value={formatMoney(-paidOut)} />
        </div>
        <ActionForm action={runPayoutsAction} submitLabel="Run payout release now" pendingLabel="Running…" variant="secondary" size="sm" className="mt-4" />
      </section>
      <section>
        <h2 className="mb-3 font-serif text-[22px]">Needs attention</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Listings to review", toReview, "/admin/review"],
            ["Unconfirmed money operations", unknownOps, "/admin/actions"],
            ["Jobs that gave up", deadJobs, "/admin/actions"],
            ["Sellers with payouts halted", halted, "/admin/actions"],
            ["Shops to approve", pendingSellers, "/admin/sellers?status=PENDING"],
            ["Open reports", openReports, "/admin/reports"],
            ["IP notices", openTakedowns, "/admin/reports#ip"],
            ["Failed partner orders", failed, "/admin/orders?filter=failed"],
            ["Open disputes", disputes, "/admin/orders?filter=disputed"],
          ].map(([label, n, href]) => (
            <li key={label as string}>
              <Link href={href as string} className="block border border-line bg-surface p-4 hover:border-ink">
                <p className="font-serif text-[28px]">{n as number}</p>
                <p className="text-[13px] text-muted">{label as string}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 font-serif text-[22px]">Integrations</h2>
        <p className="mb-3 text-[13.5px] text-muted">
          App mode: <strong>{env.mode}</strong>. Partner connections can each be real or demo; see <Link href="/admin/readiness" className="underline">Readiness</Link>.
        </p>
        <Table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.service}>
                <td>{s.service}</td>
                <td>{s.live ? <Pill tone="ok">{env.mode === "live" ? "Live" : "Real (test mode)"}</Pill> : <Pill tone="warn">Simulated</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
