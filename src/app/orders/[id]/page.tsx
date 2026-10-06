import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { FulfillmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { findProvider } from "@/fulfillment/registry";
import { currentUser } from "@/server/session";
import { confirmDeliveryAction } from "@/app/actions/orders";
import { ListingVisual } from "@/components/product/ListingVisual";
import { Button, Container, Notice, PageBand, Pill } from "@/components/ui";
import { ReviewForm } from "./ReviewForm";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const STEPS: Array<{ key: FulfillmentStatus; label: string }> = [
  { key: "SUBMITTED", label: "Ordered" },
  { key: "IN_PRODUCTION", label: "In production" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "DELIVERED", label: "Delivered" },
];
const RANK: Record<string, number> = { PENDING: 0, SUBMITTED: 0, IN_PRODUCTION: 1, SHIPPED: 2, DELIVERED: 3 };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  const [order, user] = await Promise.all([
    db.order.findUnique({
      where: { id },
      include: {
        sellerOrders: {
          include: {
            seller: true,
            fulfillments: {
              include: {
                items: {
                  include: {
                    listing: { include: { images: { orderBy: { position: "asc" }, take: 1 } } },
                    review: true,
                    entitlement: { include: { asset: { select: { fileName: true } } } },
                    listingVersion: { select: { number: true } },
                  },
                },
              },
            },
          },
        },
        disputes: true,
      },
    }),
    currentUser(),
  ]);
  if (!order) notFound();
  const owner = Boolean(user && order.buyerId === user.id);
  if (!owner && !(t && safeEqual(order.accessToken, t))) notFound();
  const tokenQs = t ? `?t=${encodeURIComponent(t)}` : "";
  const licenseIds = order.sellerOrders.flatMap((so) => so.fulfillments.flatMap((f) => f.items.map((i) => i.licenseVersionId))).filter((x): x is string => Boolean(x));
  const licenses = new Map((await db.licenseVersion.findMany({ where: { id: { in: licenseIds } } })).map((l) => [l.id, l]));

  return (
    <>
      <div className="pt-6">
        <PageBand title={`Order ${order.number}`} sub={`Placed ${formatDate(order.createdAt)} · ${formatMoney(order.totalCents + order.taxCents)}`} />
      </div>
      <Container className="mt-12 max-w-4xl space-y-8">
        {order.status === "PENDING_PAYMENT" ? (
          <Notice tone="warn" title="Waiting for payment confirmation">
            We haven&apos;t received confirmation of your payment yet. Nothing ships and no files unlock until it arrives; we&apos;ll email you. If you didn&apos;t finish paying, you haven&apos;t been charged.
          </Notice>
        ) : null}
        {order.status === "CANCELED" ? <Notice title="Canceled">This checkout was not completed. You were not charged.</Notice> : null}
        {order.refundedCents > 0 ? (
          <Notice tone="ok" title={`Refunded ${formatMoney(order.refundedCents + order.taxRefundedCents)}`}>
            Refunds go back to your original payment method and take 5–10 days to appear.
          </Notice>
        ) : null}

        {order.sellerOrders.map((so) => {
          const canConfirm = ["SHIPPED", "DELIVERED"].includes(so.status) && !so.buyerConfirmedAt && so.fulfillments.some((f) => f.provider !== "digital");
          return (
            <section key={so.id} className="border border-line bg-surface" aria-labelledby={`so-${so.id}`}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <h2 id={`so-${so.id}`} className="font-serif text-[20px]">
                  From{" "}
                  <Link href={`/s/${so.seller.slug}`} className="underline-offset-4 hover:underline">
                    {so.seller.shopName}
                  </Link>
                </h2>
                <StatusPill status={so.status} />
              </header>
              {so.fulfillments.map((f) => {
                const provider = findProvider(f.provider);
                const digital = f.provider === "digital";
                const rank = RANK[f.status] ?? -1;
                return (
                  <div key={f.id} className="border-b border-line px-5 py-5 last:border-b-0">
                    {!digital && f.status !== "FAILED" && f.status !== "CANCELED" ? (
                      <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Progress">
                        {STEPS.map((s, i) => (
                          <li key={s.key} className="text-[12px] font-semibold" aria-current={i === rank ? "step" : undefined}>
                            <span className={`mb-1.5 block h-1 ${i <= rank ? "bg-ink" : "bg-line"}`} />
                            <span className={i <= rank ? "text-ink" : "text-muted"}>{s.label}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {f.status === "FAILED" ? (
                      <Notice tone="warn" className="mb-4" title="Delayed">
                        There was a production problem with this part of your order. The seller has been told and will fix it or refund you.
                      </Notice>
                    ) : null}
                    <ul className="space-y-4">
                      {f.items.map((item) => (
                        <li key={item.id} className="flex gap-4">
                          <div className="relative size-20 shrink-0 overflow-hidden bg-surface-2">
                            <ListingVisual image={item.listing.images[0]} productTypeId={item.listing.productType} className="absolute inset-0" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link href={`/l/${item.listing.slug}`} className="font-serif text-[17px] hover:underline">
                              {item.title}
                            </Link>
                            <p className="text-[13px] text-muted">
                              {item.quantity} × {formatMoney(item.unitPriceCents)}
                              {item.variantName ? ` · ${item.variantName}` : ""}
                            </p>
                            {item.entitlement?.status === "ACTIVE" && order.paidAt ? (
                              <div className="mt-2 space-y-0.5 text-[13px] text-muted">
                                <a href={`/api/download/${item.id}${tokenQs}`} className="inline-flex items-center gap-2 text-[14px] font-semibold text-signal underline">
                                  Download {item.entitlement.asset.fileName}
                                </a>
                                <p>
                                  {item.entitlement.downloadCount} of {item.entitlement.maxDownloads} downloads used
                                  {item.listingVersion ? ` · the version you bought (v${item.listingVersion.number})` : ""}
                                  {item.licenseVersionId && licenses.get(item.licenseVersionId) ? (
                                    <>
                                      {" "}
                                      ·{" "}
                                      <Link href={`/legal/licenses/${item.licenseVersionId}`} className="underline">
                                        {licenses.get(item.licenseVersionId)!.name} licence v{licenses.get(item.licenseVersionId)!.version}
                                      </Link>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                            ) : item.entitlement?.status === "REVOKED" ? (
                              <p className="mt-2 text-[13px] text-muted">Refunded, so the download is no longer available.</p>
                            ) : digital && order.paidAt ? (
                              <p className="mt-2 text-[13px] text-muted">Your file is being prepared. Refresh in a moment.</p>
                            ) : null}
                            {owner && ["DELIVERED", "COMPLETED"].includes(so.status) && !item.review ? <ReviewForm orderId={order.id} orderItemId={item.id} /> : null}
                            {item.review ? <p className="mt-1 text-[13px] text-muted">You rated this {item.review.rating}/5. Thank you!</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-[13px] text-muted">
                      {digital
                        ? "Digital delivery · links expire after a few minutes; come back here for a fresh one."
                        : `${provider?.kind === "self" ? "Shipped by the seller" : `Made by ${provider?.name ?? f.provider}`}${f.shippedAt ? ` · shipped ${formatDateTime(f.shippedAt)}` : ""}${f.deliveredAt ? ` · delivered ${formatDateTime(f.deliveredAt)}` : ""}`}
                    </p>
                    {f.trackingNumber ? (
                      <p className="mt-1 text-[14px]">
                        Tracking: {f.trackingCarrier} {f.trackingUrl ? (
                          <a href={f.trackingUrl} className="font-semibold underline" target="_blank" rel="noreferrer">
                            {f.trackingNumber}
                          </a>
                        ) : (
                          <span className="font-semibold">{f.trackingNumber}</span>
                        )}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {canConfirm ? (
                <form action={confirmDeliveryAction} className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-4">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="sellerOrderId" value={so.id} />
                  {t ? <input type="hidden" name="t" value={t} /> : null}
                  <p className="text-[13.5px] text-muted">Got everything from {so.seller.shopName}? Confirming releases the seller&apos;s payment.</p>
                  <Button type="submit" size="sm">
                    Confirm delivery
                  </Button>
                </form>
              ) : null}
            </section>
          );
        })}

        <section className="border border-line bg-surface p-5 text-[14px]">
          <h2 className="font-serif text-[20px]">Something wrong?</h2>
          <p className="mt-1 text-muted">
            Damaged, wrong, missing items or a file that won&apos;t open are covered by our <Link href="/legal/returns" className="underline">returns policy</Link>. We hold the seller&apos;s payment until delivery, so problems can be put right.
          </p>
          <a href={`/api/support/${order.id}${tokenQs}`} className="mt-3 inline-flex font-semibold underline">
            Get help with order {order.number}
          </a>
          <p className="mt-1 text-[12.5px] text-muted">Opens an email to {BRAND.supportEmail} with your order number filled in.</p>
        </section>
      </Container>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, "neutral" | "ok" | "warn" | "danger" | "signal"]> = {
    PENDING: ["Awaiting payment", "neutral"],
    PAID: ["Preparing", "neutral"],
    IN_PRODUCTION: ["In production", "signal"],
    SHIPPED: ["Shipped", "signal"],
    DELIVERED: ["Delivered", "ok"],
    COMPLETED: ["Complete", "ok"],
    ACTION_NEEDED: ["Delayed", "warn"],
    CANCELED: ["Canceled", "neutral"],
    REFUNDED: ["Refunded", "neutral"],
  };
  const [label, tone] = map[status] ?? [status, "neutral"];
  return <Pill tone={tone}>{label}</Pill>;
}
