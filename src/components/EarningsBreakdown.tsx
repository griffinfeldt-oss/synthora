"use client";

import { FEES } from "@/config/fees";
import { breakEvenPrice, previewEarnings } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Live "what you earn" math. Pure client-side; uses the same fee functions as checkout. */
export function EarningsBreakdown({
  priceCents,
  baseCostCents,
  shippingCents,
  partnerBillsShipping,
  partnerName,
  className,
}: {
  priceCents: number;
  baseCostCents: number;
  shippingCents: number;
  partnerBillsShipping: boolean;
  partnerName?: string;
  className?: string;
}) {
  const e = previewEarnings({ priceCents, baseCostCents, shippingCents, partnerBillsShipping });
  const minPrice = breakEvenPrice({ baseCostCents, shippingCents, partnerBillsShipping, minProfitCents: 1 });
  const row = (label: string, value: number, opts: { strong?: boolean; minus?: boolean; hint?: string } = {}) => (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", opts.strong && "border-t border-line pt-2.5 font-semibold")}>
      <dt className={opts.strong ? "" : "text-muted"}>
        {label}
        {opts.hint ? <span className="block text-[12px] font-normal">{opts.hint}</span> : null}
      </dt>
      <dd className={cn("tabular-nums", opts.strong && "font-serif text-[20px]")}>
        {opts.minus && value > 0 ? "−" : ""}
        {formatMoney(Math.abs(value))}
      </dd>
    </div>
  );
  return (
    <div className={cn("border border-line bg-surface p-5", className)} aria-live="polite">
      <h3 className="font-serif text-[19px]">Your earnings per sale</h3>
      <dl className="mt-2 text-[14px]">
        {row("Buyer pays", e.buyerPaysCents, { hint: shippingCents ? `incl. ${formatMoney(shippingCents)} shipping` : undefined })}
        {row(`Commission (${FEES.commission.rateBps / 100}%)`, e.commissionCents, { minus: true })}
        {row("Card processing, at cost", e.processingFeeCents, { minus: true, hint: `${FEES.processing.rateBps / 100}% + ${FEES.processing.fixedCents}¢ (Stripe)` })}
        {row("Paid out to you", e.payoutCents, { strong: true })}
        {e.partnerBillCents > 0
          ? row(`${partnerName ?? "Partner"} bills you`, e.partnerBillCents, { minus: true, hint: partnerBillsShipping ? "production + shipping, charged to your partner account" : "your cost" })
          : null}
        {row("You keep", e.profitCents, { strong: true })}
      </dl>
      <p className={cn("mt-2 text-[12.5px]", e.profitCents <= 0 ? "font-semibold text-danger" : "text-muted")}>
        {e.profitCents <= 0
          ? `At this price you lose money. Charge at least ${formatMoney(minPrice)}.`
          : `${e.marginPct}% margin. Plus ${formatMoney(FEES.subscription.monthlyCents)}/month for your shop, however much you sell.`}
      </p>
    </div>
  );
}
