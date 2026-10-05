import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { findProvider } from "@/fulfillment/registry";
import { requireSeller } from "@/server/session";
import { ActionForm } from "@/components/ActionForm";
import { Button, Field, Input, Notice, Pill } from "@/components/ui";
import { addTrackingAction, retryFulfillmentAction, sellerRefundAction, simulateEventAction } from "../../actions";
import { PayoutStatusPill, SellerOrderStatus } from "../StatusPill";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function SellerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { seller } = await requireSeller();
  const so = await db.sellerOrder.findFirst({
    where: { id: (await params).id, sellerId: seller.id },
    include: { order: { include: { disputes: true } }, fulfillments: { include: { items: true } }, payouts: true, ledger: { orderBy: { createdAt: "asc" }, where: { account: "SELLER" } } },
  });
  if (!so) notFound();
  const address = so.order.shippingAddress as null | { name: string; line1: string; line2?: string; city: string; state?: string; postalCode: string; country: string };
  const gross = so.itemsCents + so.shippingCents;
  const connections = await db.partnerConnection.findMany({ where: { sellerId: seller.id } });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/seller/orders" className="text-[13px] font-semibold text-muted underline">
            ← Orders
          </Link>
          <h2 className="mt-1 font-serif text-[26px]">Order {so.order.number}</h2>
          <p className="text-[13.5px] text-muted">
            Placed {formatDateTime(so.order.createdAt)} · {so.order.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SellerOrderStatus status={so.status} />
          <PayoutStatusPill status={so.payoutStatus} />
        </div>
      </div>

      {so.order.disputes.some((d) => d.status === "OPEN") ? (
        <Notice tone="danger" title="Payment disputed">
          The buyer&apos;s bank opened a chargeback. Payout is on hold. Reply to our email with tracking or proof of delivery.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {so.fulfillments.map((f) => {
            const provider = findProvider(f.provider);
            const conn = connections.find((c) => c.id === f.connectionId);
            const demo = conn?.mock || mock.fulfillment;
            return (
              <section key={f.id} className="border border-line bg-surface">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                  <h3 className="font-semibold">
                    {provider?.name ?? f.provider}
                    {f.partnerOrderId && provider?.kind === "pod" ? <span className="ml-2 text-[12.5px] font-normal text-muted">partner order {f.partnerOrderId}</span> : null}
                  </h3>
                  <Pill tone={f.status === "FAILED" ? "danger" : f.status === "DELIVERED" ? "ok" : "neutral"}>{f.status.replace("_", " ").toLowerCase()}</Pill>
                </header>
                <div className="space-y-4 px-5 py-4">
                  <ul className="space-y-1 text-[14px]">
                    {f.items.map((i) => (
                      <li key={i.id}>
                        {i.quantity}× {i.title}
                        {i.variantName ? <span className="text-muted"> · {i.variantName}</span> : null}
                        <span className="text-muted"> · {formatMoney(i.unitPriceCents)} each</span>
                      </li>
                    ))}
                  </ul>
                  {f.status === "FAILED" ? (
                    <Notice tone="danger" title={`${provider?.name} could not take this order`}>
                      <p>{f.failureReason}</p>
                      <p className="mt-1">Fix the problem in your {provider?.name} account (billing, print file, address) and retry, or refund the buyer below.</p>
                      <form action={retryFulfillmentAction} className="mt-3">
                        <input type="hidden" name="fulfillmentId" value={f.id} />
                        <Button size="sm">Retry sending to {provider?.name}</Button>
                      </form>
                    </Notice>
                  ) : null}
                  {f.trackingNumber ? (
                    <p className="text-[14px]">
                      Tracking: {f.trackingCarrier}{" "}
                      {f.trackingUrl ? (
                        <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
                          {f.trackingNumber}
                        </a>
                      ) : (
                        <strong>{f.trackingNumber}</strong>
                      )}
                      {f.shippedAt ? ` · shipped ${formatDate(f.shippedAt)}` : ""}
                      {f.deliveredAt ? ` · delivered ${formatDate(f.deliveredAt)}` : ""}
                    </p>
                  ) : null}
                  {provider?.kind === "self" && f.status === "PENDING" ? (
                    <ActionForm action={addTrackingAction} submitLabel="Mark as shipped" size="sm">
                      <input type="hidden" name="fulfillmentId" value={f.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Carrier" htmlFor={`c-${f.id}`}>
                          <Input id={`c-${f.id}`} name="carrier" placeholder="USPS" required />
                        </Field>
                        <Field label="Tracking number" htmlFor={`n-${f.id}`} className="sm:col-span-2">
                          <Input id={`n-${f.id}`} name="number" required />
                        </Field>
                      </div>
                      <Field label="Tracking link (optional)" htmlFor={`u-${f.id}`}>
                        <Input id={`u-${f.id}`} name="url" type="url" />
                      </Field>
                    </ActionForm>
                  ) : null}
                  {demo && provider?.kind === "pod" && f.partnerOrderId && !["DELIVERED", "CANCELED"].includes(f.status) ? (
                    <div className="border border-dashed border-line-strong p-3">
                      <p className="text-[12.5px] font-semibold text-muted">Demo connection · simulate a {provider.name} webhook:</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["IN_PRODUCTION", "SHIPPED", "DELIVERED", "FAILED"] as const).map((s) => (
                          <form key={s} action={simulateEventAction}>
                            <input type="hidden" name="fulfillmentId" value={f.id} />
                            <input type="hidden" name="status" value={s} />
                            <Button size="sm" variant="secondary">
                              {s.replace("_", " ").toLowerCase()}
                            </Button>
                          </form>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {conn ? null : provider?.kind === "pod" ? <p className="text-[13px] text-danger">Partner connection missing. Reconnect on the partners page.</p> : null}
                </div>
              </section>
            );
          })}

          {address ? (
            <section className="border border-line bg-surface p-5 text-[14px]">
              <h3 className="font-semibold">Ship to</h3>
              <address className="mt-1 not-italic text-muted">
                {address.name}
                <br />
                {address.line1}
                {address.line2 ? <>, {address.line2}</> : null}
                <br />
                {address.city}
                {address.state ? `, ${address.state}` : ""} {address.postalCode}, {address.country}
              </address>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="border border-line bg-surface p-5 text-[14px]">
            <h3 className="font-serif text-[19px]">Money</h3>
            <dl className="mt-2 space-y-1.5">
              {[
                ["Items", so.itemsCents],
                ["Shipping charged", so.shippingCents],
                ["Commission", -so.commissionCents],
                ["Card processing", -so.processingFeeCents],
                ...(so.refundedCents ? [["Refunded", -so.refundedCents] as [string, number]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular-nums">{(v as number) < 0 ? "−" : ""}{formatMoney(Math.abs(v as number))}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <dt>Your payout</dt>
                <dd>{formatMoney(so.netCents)}</dd>
              </div>
              {so.partnerCostCents ? (
                <div className="flex justify-between text-[13px] text-muted">
                  <dt>Partner bills you (est.)</dt>
                  <dd>{formatMoney(so.partnerCostCents)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">
              {so.payoutStatus === "PAID"
                ? `Paid out ${formatDate(so.payouts.find((p) => p.status === "PAID")?.createdAt ?? null)}.`
                : so.payoutEligibleAt
                  ? `Releases ${formatDate(so.payoutEligibleAt)} (or when the buyer confirms delivery).`
                  : "Held until the order is delivered."}
            </p>
          </section>
          {so.refundedCents < gross && so.order.paidAt ? (
            <section className="border border-line bg-surface p-5">
              <h3 className="font-serif text-[19px]">Refund the buyer</h3>
              <ActionForm action={sellerRefundAction} submitLabel="Refund" variant="danger" size="sm" className="mt-3">
                <input type="hidden" name="sellerOrderId" value={so.id} />
                <Field label="Amount (blank = full)" htmlFor="amount">
                  <Input id="amount" name="amount" inputMode="decimal" placeholder={(gross - so.refundedCents) / 100 + ""} />
                </Field>
                <Field label="Reason" htmlFor="reason">
                  <Input id="reason" name="reason" required />
                </Field>
              </ActionForm>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
