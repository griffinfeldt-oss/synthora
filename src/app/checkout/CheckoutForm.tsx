"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button, ButtonLink, EmptyState, Field, Input, Notice, Select } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { priceCartAction, startCheckoutAction, type PricedCartView } from "@/app/actions/cart";

const COUNTRIES = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["IE", "Ireland"],
  ["NZ", "New Zealand"],
  ["SE", "Sweden"],
] as const;

export function CheckoutForm({ defaultEmail, defaultName }: { defaultEmail: string; defaultName: string }) {
  const cart = useCart();
  const [email, setEmail] = useState(defaultEmail);
  const [addr, setAddr] = useState({ name: defaultName, line1: "", line2: "", city: "", state: "", postalCode: "", country: "US" });
  const [priced, setPriced] = useState<PricedCartView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [, startQuote] = useTransition();

  const items = useMemo(() => cart.lines.map((l) => ({ listingId: l.listingId, variantId: l.variantId, quantity: l.quantity })), [cart.lines]);
  const needsAddress = cart.lines.some((l) => !l.digital);
  const addressComplete = addr.name.length > 1 && addr.line1.length > 2 && addr.city.length > 1 && addr.postalCode.length > 2;

  // Re-quote with real partner rates once the address is complete.
  const quoteKey = JSON.stringify([items, needsAddress && addressComplete ? [addr.postalCode, addr.country, addr.state, addr.city] : null]);
  useEffect(() => {
    if (!cart.ready || items.length === 0) return;
    const t = setTimeout(() => {
      startQuote(async () => {
        const res = await priceCartAction(items, needsAddress && addressComplete ? addr : undefined);
        if ("error" in res) setError(res.error);
        else {
          setPriced(res);
          setError(null);
        }
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, cart.ready]);

  if (cart.ready && cart.lines.length === 0)
    return <EmptyState title="Nothing to check out" action={<ButtonLink href="/shop">Browse the shop</ButtonLink>} />;

  const set = (k: keyof typeof addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddr((a) => ({ ...a, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startSubmit(async () => {
      const res = await startCheckoutAction({ items, shipTo: needsAddress ? addr : null, email });
      if ("error" in res) setError(res.error);
      else window.location.href = res.url;
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-10 lg:grid-cols-[1fr_360px]" noValidate={false}>
      <div className="space-y-10">
        <fieldset className="space-y-4">
          <legend className="mb-2 font-serif text-[24px]">Contact</legend>
          <Field label="Email for your receipt and tracking" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </fieldset>

        {needsAddress ? (
          <fieldset className="space-y-4">
            <legend className="mb-2 font-serif text-[24px]">Shipping address</legend>
            <Field label="Full name" htmlFor="name">
              <Input id="name" autoComplete="name" required value={addr.name} onChange={set("name")} />
            </Field>
            <Field label="Address" htmlFor="line1">
              <Input id="line1" autoComplete="address-line1" required value={addr.line1} onChange={set("line1")} />
            </Field>
            <Field label="Apartment, suite (optional)" htmlFor="line2">
              <Input id="line2" autoComplete="address-line2" value={addr.line2} onChange={set("line2")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" htmlFor="city">
                <Input id="city" autoComplete="address-level2" required value={addr.city} onChange={set("city")} />
              </Field>
              <Field label="State / region" htmlFor="state">
                <Input id="state" autoComplete="address-level1" value={addr.state} onChange={set("state")} />
              </Field>
              <Field label="Postal code" htmlFor="postalCode">
                <Input id="postalCode" autoComplete="postal-code" required value={addr.postalCode} onChange={set("postalCode")} />
              </Field>
              <Field label="Country" htmlFor="country">
                <Select id="country" autoComplete="country" value={addr.country} onChange={set("country")}>
                  {COUNTRIES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </fieldset>
        ) : (
          <Notice title="Digital order">Your files will be ready to download as soon as payment goes through. No address needed.</Notice>
        )}
      </div>

      <aside className="h-fit border border-line bg-surface p-6" aria-label="Order summary">
        <h2 className="font-serif text-[22px]">Your order</h2>
        <ul className="mt-4 space-y-2 text-[14px]">
          {cart.lines.map((l) => (
            <li key={`${l.listingId}-${l.variantId}`} className="flex justify-between gap-3">
              <span className="min-w-0">
                {l.quantity}× {l.title}
                {l.variantName ? <span className="text-muted"> ({l.variantName})</span> : null}
              </span>
              <span className="shrink-0">{formatMoney((priced?.lines.find((p) => p.listingId === l.listingId && p.variantId === l.variantId)?.lineCents) ?? l.priceCents * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[14px]">
          {priced?.sellers.map((s) => (
            <div key={s.shopName} className="flex justify-between gap-3">
              <dt className="text-muted">
                Shipping · {s.shopName}
                {s.maxDays > 0 ? <span className="block text-[12px]">{s.minDays}–{s.maxDays} business days</span> : null}
              </dt>
              <dd className="shrink-0">{s.shippingCents ? formatMoney(s.shippingCents) : "Free"}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-3 font-semibold">
            <dt>Total</dt>
            <dd className="font-serif text-[20px]">{priced ? formatMoney(priced.totalCents) : "…"}</dd>
          </div>
        </dl>
        {priced?.shippingEstimated && needsAddress ? <p className="mt-2 text-[12.5px] text-muted">Enter your address for exact shipping.</p> : null}
        {error ? (
          <p className="mt-4 text-[14px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting || !priced || priced.unavailable.length > 0}>
          {submitting ? "Opening secure checkout…" : "Pay with Stripe"}
        </Button>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Card details are entered on Stripe, never on Synthora. By paying you agree to the{" "}
          <a href="/legal/buyer-terms" className="underline">
            buyer terms
          </a>
          .
        </p>
      </aside>
    </form>
  );
}
