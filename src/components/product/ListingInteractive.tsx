"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button, Field, Select, Textarea, Input } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { reportListingAction } from "@/app/actions/report";

interface Variant {
  id: string;
  name: string;
  priceCents: number | null;
}

export function AddToCart({
  listingId,
  title,
  priceCents,
  variants,
  digital,
  maxQuantity,
}: {
  listingId: string;
  title: string;
  priceCents: number;
  variants: Variant[];
  digital: boolean;
  maxQuantity: number | null;
}) {
  const cart = useCart();
  const router = useRouter();
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = variants.find((v) => v.id === variantId);
  const unit = variant?.priceCents ?? priceCents;
  const soldOut = maxQuantity !== null && maxQuantity <= 0;
  const max = Math.min(20, maxQuantity ?? 20);

  const add = () => {
    cart.add({ listingId, variantId, quantity: qty, title, priceCents: unit, variantName: variants.length > 1 ? variant?.name : null, digital });
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div className="space-y-5">
      {variants.length > 1 ? (
        <Field label="Size / option" htmlFor="variant">
          <Select id="variant" value={variantId ?? ""} onChange={(e) => setVariantId(e.target.value)} className="max-w-xs">
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.priceCents && v.priceCents !== priceCents ? ` · ${formatMoney(v.priceCents)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {!digital ? (
        <Field label="Quantity" htmlFor="qty">
          <input
            id="qty"
            type="number"
            min={1}
            max={max}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
            className="h-11 w-20 rounded-[2px] border border-line-strong bg-surface px-3 text-[15px] focus:border-ink focus:outline-none"
          />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={add} disabled={soldOut} size="lg">
          {soldOut ? "Sold out" : added ? "Added ✓" : "Add to cart"}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={soldOut}
          onClick={() => {
            add();
            router.push("/checkout");
          }}
        >
          Buy now
        </Button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {added ? `${title} added to your cart` : ""}
      </p>
    </div>
  );
}

export function Gallery({ main, thumbs }: { main: React.ReactNode[]; thumbs: React.ReactNode[] }) {
  const [active, setActive] = useState(0);
  const count = main.length;
  return (
    <div>
      <div className="relative aspect-square overflow-hidden border border-line bg-surface-2">{main[active]}</div>
      {count > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-2" role="tablist" aria-label="Product images">
          {thumbs.map((child, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Image ${i + 1} of ${count}`}
              onClick={() => setActive(i)}
              className={`aspect-square overflow-hidden border-2 bg-surface-2 ${i === active ? "border-ink" : "border-transparent hover:border-line-strong"}`}
            >
              <div className="pointer-events-none h-full w-full">{child}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const REASONS = [
  { value: "NOT_AI_MADE", label: "Not actually AI-made / disclosure is wrong" },
  { value: "IP_INFRINGEMENT", label: "Copies someone else's work or trademark" },
  { value: "PROHIBITED_ITEM", label: "Prohibited item" },
  { value: "MISLEADING", label: "Misleading photos or description" },
  { value: "OFFENSIVE", label: "Offensive or hateful content" },
  { value: "SCAM", label: "Scam or fraud" },
  { value: "OTHER", label: "Something else" },
];

export function ReportButton({ listingId, signedIn }: { listingId: string; signedIn: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [state, action, pending] = useActionState(reportListingAction, null as null | { ok: boolean; message: string });
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted underline hover:text-ink">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
        </svg>
        Report this listing
      </button>
      <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto w-[min(520px,calc(100vw-32px))] border border-line bg-surface p-0 text-ink backdrop:bg-black/50">
        <div className="p-6">
          <h2 id={`${id}-title`} className="font-serif text-[24px]">
            Report this listing
          </h2>
          {state?.ok ? (
            <div className="mt-4 space-y-4">
              <p role="status">{state.message}</p>
              <Button onClick={() => dialog.current?.close()}>Close</Button>
            </div>
          ) : (
            <form action={action} className="mt-4 space-y-4">
              <input type="hidden" name="listingId" value={listingId} />
              <Field label="What's wrong?" htmlFor={`${id}-reason`}>
                <Select id={`${id}-reason`} name="reason" required defaultValue="">
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Details" htmlFor={`${id}-details`} hint="For copyright claims by the rights owner, use the IP notice form for faster handling.">
                <Textarea id={`${id}-details`} name="details" required minLength={10} maxLength={2000} />
              </Field>
              {!signedIn ? (
                <Field label="Your email (so we can follow up)" htmlFor={`${id}-email`}>
                  <Input id={`${id}-email`} name="email" type="email" required />
                </Field>
              ) : null}
              {state && !state.ok ? (
                <p className="text-[14px] text-danger" role="alert">
                  {state.message}
                </p>
              ) : null}
              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Sending…" : "Send report"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
