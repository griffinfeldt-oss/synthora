import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { formatMoney } from "@/lib/money";
import { ButtonLink, Container, Notice, PageBand } from "@/components/ui";
import { ClearCart } from "./ClearCart";

export const metadata: Metadata = { title: "Thank you" };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { order: orderId, t } = await searchParams;
  if (!orderId || !t) notFound();
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { select: { provider: true } } } });
  if (!order || !safeEqual(order.accessToken, t)) notFound();
  const paid = order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED";
  const allDigital = order.items.every((i) => i.provider === "digital");
  const anyDigital = order.items.some((i) => i.provider === "digital");
  return (
    <>
      <ClearCart />
      <div className="pt-6">
        <PageBand title={paid ? "Thank you" : "Almost there"} sub={`Order ${order.number}`} />
      </div>
      <Container className="mt-12 max-w-2xl text-center">
        {paid ? (
          <p className="text-[17px]">
            We received <strong>{formatMoney(order.totalCents + order.taxCents)}</strong>. A receipt is on its way to {order.email}.{" "}
            {allDigital ? "Your files are ready on your order page." : anyDigital ? "Your files are ready on your order page, and the sellers are preparing the rest." : "The sellers have been told and are preparing your order."}
          </p>
        ) : (
          <Notice title="Waiting for payment confirmation">Stripe is confirming your payment. This page updates on reload; you will also get an email.</Notice>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href={`/orders/${order.id}?t=${order.accessToken}`}>Track your order</ButtonLink>
          <ButtonLink href="/shop" variant="secondary">
            Keep shopping
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
