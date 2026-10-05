"use client";

import { useState } from "react";
import { EarningsBreakdown } from "@/components/EarningsBreakdown";
import { Field, Input, Select } from "@/components/ui";
import { parseMoneyToCents } from "@/lib/money";

const PRESETS = [
  { id: "tee", label: "T-shirt via Printify", base: 807, ship: 475, partner: "Printify", bills: true, price: "29.00" },
  { id: "poster", label: "18×24 poster via Printful", base: 1325, ship: 599, partner: "Printful", bills: true, price: "34.00" },
  { id: "mug", label: "Mug via Gelato", base: 690, ship: 599, partner: "Gelato", bills: true, price: "19.00" },
  { id: "digital", label: "Digital download", base: 0, ship: 0, partner: "", bills: false, price: "9.00" },
  { id: "self", label: "Patch you ship yourself", base: 250, ship: 400, partner: "Your costs", bills: false, price: "14.00" },
];

export function Calculator() {
  const [presetId, setPresetId] = useState("tee");
  const p = PRESETS.find((x) => x.id === presetId)!;
  const [price, setPrice] = useState(p.price);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="Product" htmlFor="calc-product">
          <Select
            id="calc-product"
            value={presetId}
            onChange={(e) => {
              setPresetId(e.target.value);
              setPrice(PRESETS.find((x) => x.id === e.target.value)!.price);
            }}
          >
            {PRESETS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Your price (USD)" htmlFor="calc-price">
          <Input id="calc-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <p className="text-[13px] text-muted">Partner costs are typical US prices; your real cost is on your partner invoice.</p>
      </div>
      <EarningsBreakdown priceCents={parseMoneyToCents(price) ?? 0} baseCostCents={p.base} shippingCents={p.ship} partnerBillsShipping={p.bills} partnerName={p.partner} />
    </div>
  );
}
