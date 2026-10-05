import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { requireSeller } from "@/server/session";
import { MockFrame } from "../MockFrame";

export default async function MockDashboard() {
  if (!mock.stripe) notFound();
  const { seller } = await requireSeller();
  const payouts = await db.payout.findMany({ where: { sellerId: seller.id, status: "PAID" }, orderBy: { createdAt: "desc" }, take: 10 });
  return (
    <MockFrame title={`${seller.shopName} · Express dashboard`}>
      <p className="text-[14px] text-muted">Account {seller.stripeAccountId}</p>
      <ul className="mt-4 divide-y divide-line border border-line text-[14px]">
        {payouts.length ? (
          payouts.map((p) => (
            <li key={p.id} className="flex justify-between px-4 py-2.5">
              <span>Transfer {p.stripeTransferId?.slice(-8)}</span>
              <span>
                {formatMoney(p.amountCents)} · {formatDate(p.createdAt)}
              </span>
            </li>
          ))
        ) : (
          <li className="px-4 py-3 text-muted">No transfers yet.</li>
        )}
      </ul>
    </MockFrame>
  );
}
