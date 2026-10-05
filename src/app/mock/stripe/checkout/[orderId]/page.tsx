import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui";
import { mockPayAction } from "../../actions";
import { MockFrame } from "../../MockFrame";

export const dynamic = "force-dynamic";

export default async function MockCheckout({ params }: { params: Promise<{ orderId: string }> }) {
  if (!mock.stripe) notFound();
  const order = await db.order.findUnique({ where: { id: (await params).orderId }, include: { items: true } });
  if (!order) notFound();
  const paid = order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED";
  return (
    <MockFrame title={`Pay Latent.Market`}>
      <ul className="space-y-1.5 text-[14px]">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-4">
            <span>
              {i.quantity}× {i.title}
            </span>
            <span>{formatMoney(i.unitPriceCents * i.quantity)}</span>
          </li>
        ))}
        {order.shippingCents ? (
          <li className="flex justify-between gap-4 text-muted">
            <span>Shipping</span>
            <span>{formatMoney(order.shippingCents)}</span>
          </li>
        ) : null}
        <li className="flex justify-between gap-4 border-t border-line pt-2 text-[16px] font-semibold">
          <span>Total</span>
          <span>{formatMoney(order.totalCents)}</span>
        </li>
      </ul>
      <div className="mt-5 space-y-2 border border-line bg-surface-2 p-4 text-[13.5px] text-muted">
        <p className="font-semibold text-ink">Card · 4242 4242 4242 4242 (test)</p>
        <p>No card is entered in demo mode. The real app sends buyers to Stripe Checkout.</p>
      </div>
      {paid ? (
        <p className="mt-5 text-[14px]">
          This order is already paid.{" "}
          <Link className="underline" href={`/checkout/success?order=${order.id}&t=${order.accessToken}`}>
            View it
          </Link>
        </p>
      ) : (
        <form action={mockPayAction} className="mt-5 space-y-2">
          <input type="hidden" name="orderId" value={order.id} />
          <Button type="submit" size="lg" className="w-full bg-[#635bff] text-white hover:bg-[#5146ef]">
            Pay {formatMoney(order.totalCents)}
          </Button>
          <Link href="/cart?canceled=1" className="block py-2 text-center text-[13.5px] font-semibold text-muted underline">
            Cancel and return to cart
          </Link>
        </form>
      )}
    </MockFrame>
  );
}
