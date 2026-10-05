import Link from "next/link";
import type { Metadata } from "next";
import type { LedgerType } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { Table } from "@/components/ui";

export const metadata: Metadata = { title: "Ledger · Admin" };
export const dynamic = "force-dynamic";

const TYPES: LedgerType[] = ["CHARGE", "SELLER_SALE", "COMMISSION", "PROCESSING_FEE", "PAYOUT", "REFUND", "COMMISSION_REVERSAL", "TRANSFER_REVERSAL", "DISPUTE", "SUBSCRIPTION", "ADJUSTMENT"];

export default async function AdminLedger({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { type, account } = await searchParams;
  const where = { ...(type ? { type: type as LedgerType } : {}), ...(account ? { account } : {}) };
  const [entries, totals] = await Promise.all([
    db.ledgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, include: { seller: { select: { shopName: true } }, order: { select: { number: true, id: true } } } }),
    db.ledgerEntry.groupBy({ by: ["account"], _sum: { amountCents: true } }),
  ]);
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-[24px]">Order & payout ledger</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {totals.map((t) => (
          <div key={t.account} className="border border-line bg-surface p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              {t.account === "PLATFORM" ? "Platform revenue" : t.account === "SELLER" ? "Owed to sellers" : "Stripe balance (est.)"}
            </p>
            <p className="mt-1 font-serif text-[24px]">{formatMoney(t._sum.amountCents ?? 0)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[13px]">
        <Link href="/admin/ledger" className="border border-line-strong px-2.5 py-1 font-semibold">
          all
        </Link>
        {TYPES.map((t) => (
          <Link key={t} href={`/admin/ledger?type=${t}`} className={`border px-2.5 py-1 font-semibold ${type === t ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>
            {t.toLowerCase().replaceAll("_", " ")}
          </Link>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Account</th>
            <th>Amount</th>
            <th>Seller</th>
            <th>Order</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="text-[12.5px]">{formatDateTime(e.createdAt)}</td>
              <td className="text-[12.5px] font-semibold">{e.type}</td>
              <td className="text-[12.5px]">{e.account}</td>
              <td className={`tabular-nums ${e.amountCents < 0 ? "text-danger" : ""}`}>{formatMoney(e.amountCents)}</td>
              <td className="text-[12.5px]">{e.seller?.shopName ?? "—"}</td>
              <td className="text-[12.5px]">{e.order ? <Link href={`/admin/orders/${e.order.id}`} className="underline">{e.order.number}</Link> : "—"}</td>
              <td className="font-mono text-[11.5px] text-muted">{e.stripeRef ?? e.memo ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
