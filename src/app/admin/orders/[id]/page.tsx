import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ActionForm } from "@/components/ActionForm";
import { Field, Input, Pill, Table } from "@/components/ui";
import { adminRefundAction } from "../../actions";

export const metadata: Metadata = { title: "Order · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const order = await db.order.findUnique({
    where: { id: (await params).id },
    include: {
      sellerOrders: { include: { seller: true, fulfillments: true, items: true, payouts: true } },
      ledger: { orderBy: { createdAt: "asc" } },
      disputes: true,
    },
  });
  if (!order) notFound();
  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/orders" className="text-[13px] font-semibold text-muted underline">
          ← Orders
        </Link>
        <h2 className="mt-1 font-serif text-[26px]">Order {order.number}</h2>
        <p className="text-[13.5px] text-muted">
          {order.email} · {formatDateTime(order.createdAt)} · {order.status.toLowerCase()} · total {formatMoney(order.totalCents)} · Stripe fee {formatMoney(order.processingFeeCents ?? 0)}
          {order.stripePaymentIntentId ? ` · ${order.stripePaymentIntentId}` : ""}
        </p>
        <Link href={`/orders/${order.id}?t=${order.accessToken}`} className="text-[13px] underline">
          Buyer&apos;s order page
        </Link>
      </div>

      {order.sellerOrders.map((so) => (
        <section key={so.id} className="grid gap-4 border border-line bg-surface p-5 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-[20px]">{so.seller.shopName}</h3>
              <Pill>{so.status.toLowerCase()}</Pill>
              <Pill tone={so.payoutStatus === "PAID" ? "ok" : so.payoutStatus === "BLOCKED" ? "warn" : "neutral"}>payout {so.payoutStatus.toLowerCase()}</Pill>
            </div>
            <ul className="mt-2 text-[14px]">
              {so.items.map((i) => (
                <li key={i.id}>
                  {i.quantity}× {i.title} @ {formatMoney(i.unitPriceCents)} · {i.provider}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted">
              Gross {formatMoney(so.itemsCents + so.shippingCents)} · commission {formatMoney(so.commissionCents)} · processing {formatMoney(so.processingFeeCents)} · refunded {formatMoney(so.refundedCents)} · net {formatMoney(so.netCents)}
            </p>
            <ul className="mt-2 text-[13px] text-muted">
              {so.fulfillments.map((f) => (
                <li key={f.id}>
                  {f.provider} {f.partnerOrderId ?? ""}: {f.status.toLowerCase()}
                  {f.failureReason ? ` (${f.failureReason})` : ""}
                  {f.trackingNumber ? ` · ${f.trackingCarrier} ${f.trackingNumber}` : ""}
                </li>
              ))}
            </ul>
          </div>
          {order.paidAt && so.refundedCents < so.itemsCents + so.shippingCents ? (
            <ActionForm action={adminRefundAction} submitLabel="Refund this seller's part" variant="danger" size="sm">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="sellerOrderId" value={so.id} />
              <Field label="Amount (blank = all remaining)" htmlFor={`a-${so.id}`}>
                <Input id={`a-${so.id}`} name="amount" inputMode="decimal" />
              </Field>
              <Field label="Reason" htmlFor={`r-${so.id}`}>
                <Input id={`r-${so.id}`} name="reason" required />
              </Field>
            </ActionForm>
          ) : null}
        </section>
      ))}

      {order.paidAt && order.refundedCents < order.totalCents ? (
        <ActionForm action={adminRefundAction} submitLabel="Refund entire order" variant="danger" size="sm" className="max-w-sm">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="scope" value="order" />
          <Field label="Reason" htmlFor="order-reason">
            <Input id="order-reason" name="reason" required />
          </Field>
        </ActionForm>
      ) : null}

      <section>
        <h3 className="mb-3 font-serif text-[20px]">Ledger for this order</h3>
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Memo</th>
            </tr>
          </thead>
          <tbody>
            {order.ledger.map((e) => (
              <tr key={e.id}>
                <td className="text-[12.5px]">{formatDateTime(e.createdAt)}</td>
                <td className="text-[12.5px] font-semibold">{e.type}</td>
                <td className="text-[12.5px]">{e.account}</td>
                <td className={`tabular-nums ${e.amountCents < 0 ? "text-danger" : ""}`}>{formatMoney(e.amountCents)}</td>
                <td className="text-[12.5px] text-muted">{e.memo}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
