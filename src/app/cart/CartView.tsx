"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ListingVisual } from "@/components/product/ListingVisual";
import { AiChip, ButtonLink, EmptyState, Notice } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { priceCartAction, type PricedCartView } from "@/app/actions/cart";

export function CartView({ canceled }: { canceled: boolean }) {
  const cart = useCart();
  const [priced, setPriced] = useState<PricedCartView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const key = JSON.stringify(cart.lines.map((l) => [l.listingId, l.variantId, l.quantity]));
  useEffect(() => {
    if (!cart.ready) return;
    if (cart.lines.length === 0) {
      setPriced(null);
      return;
    }
    startTransition(async () => {
      const res = await priceCartAction(cart.lines.map((l) => ({ listingId: l.listingId, variantId: l.variantId, quantity: l.quantity })));
      if ("error" in res) setError(res.error);
      else {
        setError(null);
        setPriced(res);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cart.ready]);

  if (!cart.ready) return <p className="text-muted">Loading your cart…</p>;
  if (cart.lines.length === 0)
    return (
      <EmptyState title="Your cart is empty" action={<ButtonLink href="/shop">Browse the shop</ButtonLink>}>
        Everything here is made with AI, and every listing tells you how.
      </EmptyState>
    );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div>
        {canceled ? (
          <Notice tone="warn" className="mb-6" title="Checkout canceled">
            You were not charged. Your cart is just as you left it.
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="danger" className="mb-6" title="Something went wrong">
            {error}
          </Notice>
        ) : null}
        {priced?.unavailable.length ? (
          <Notice tone="warn" className="mb-6" title="Some items changed">
            <ul className="list-disc pl-5">
              {priced.unavailable.map((u) => {
                const line = cart.lines.find((l) => l.listingId === u.listingId);
                return (
                  <li key={u.listingId}>
                    {line?.title ?? "An item"}: {u.reason}{" "}
                    <button className="font-semibold underline" onClick={() => cart.remove(u.listingId, line?.variantId ?? null)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          </Notice>
        ) : null}
        <ul className="divide-y divide-line border-y border-line">
          {cart.lines.map((l) => {
            const p = priced?.lines.find((x) => x.listingId === l.listingId && x.variantId === l.variantId);
            return (
              <li key={`${l.listingId}-${l.variantId}`} className="flex gap-4 py-5">
                <Link href={p ? `/l/${p.slug}` : "#"} className="relative block size-24 shrink-0 overflow-hidden bg-surface-2 sm:size-28">
                  {p?.image ? <ListingVisual image={p.image} productTypeId={p.productType} className="absolute inset-0" /> : null}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={p ? `/l/${p.slug}` : "#"} className="font-serif text-[18px] leading-snug hover:underline">
                        {l.title}
                      </Link>
                      {l.variantName ? <p className="text-[13px] text-muted">{l.variantName}</p> : null}
                      {p ? <p className="text-[13px] text-muted">by {p.shopName}</p> : null}
                    </div>
                    <p className="shrink-0 font-serif text-[18px]">{formatMoney(p?.lineCents ?? l.priceCents * l.quantity)}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                    {p ? <AiChip tool={p.aiTool} /> : null}
                    {l.digital ? (
                      <span className="text-[13px] text-muted">Digital download</span>
                    ) : (
                      <label className="flex items-center gap-2 text-[13px] text-muted">
                        Qty
                        <input
                          type="number"
                          min={1}
                          max={Math.min(20, p?.maxQuantity ?? 20)}
                          value={l.quantity}
                          onChange={(e) => cart.update(l.listingId, l.variantId, Number(e.target.value) || 1)}
                          className="h-9 w-16 rounded-[2px] border border-line-strong bg-surface px-2 text-ink"
                        />
                      </label>
                    )}
                    <button onClick={() => cart.remove(l.listingId, l.variantId)} className="ml-auto text-[13px] font-semibold text-muted underline hover:text-ink">
                      Remove<span className="sr-only"> {l.title}</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="h-fit border border-line bg-surface p-6" aria-label="Order summary">
        <h2 className="font-serif text-[22px]">Summary</h2>
        <dl className="mt-4 space-y-2 text-[14.5px]">
          <div className="flex justify-between">
            <dt className="text-muted">Items</dt>
            <dd>{priced ? formatMoney(priced.itemsCents) : "…"}</dd>
          </div>
          {priced?.sellers.map((s) => (
            <div key={s.shopName} className="flex justify-between gap-3">
              <dt className="text-muted">Shipping from {s.shopName}</dt>
              <dd className="shrink-0">{s.shippingCents ? formatMoney(s.shippingCents) : "Free"}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-3 font-semibold">
            <dt>Estimated total</dt>
            <dd className="font-serif text-[20px]">{priced ? formatMoney(priced.totalCents) : "…"}</dd>
          </div>
        </dl>
        {priced?.hasPhysical ? <p className="mt-2 text-[12.5px] text-muted">Shipping is estimated to the US; exact rates are quoted from your address at checkout.</p> : null}
        <ButtonLink href="/checkout" size="lg" className="mt-6 w-full" aria-disabled={!priced || priced.unavailable.length > 0}>
          Checkout
        </ButtonLink>
        <p className="mt-4 flex items-start gap-2 text-[12.5px] text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="1" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Pay securely with Stripe. We hold your payment until your order is delivered.
        </p>
      </aside>
    </div>
  );
}
