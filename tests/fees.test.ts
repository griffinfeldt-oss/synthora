import { describe, expect, it } from "vitest";
import { FEES } from "@/config/fees";
import {
  allocateProportionally,
  breakEvenPrice,
  commissionFor,
  estimateProcessingFee,
  payoutReleaseDate,
  previewEarnings,
  refundImpact,
  splitOrder,
} from "@/lib/fees";

describe("fee config", () => {
  it("matches the product rules", () => {
    expect(FEES.subscription.monthlyCents).toBe(300);
    expect(FEES.commission.rateBps).toBe(800);
    expect(FEES.commission.appliesToShipping).toBe(false);
  });
});

describe("commission", () => {
  it("is 8% of items, rounded to the cent", () => {
    expect(commissionFor(2900)).toBe(232);
    expect(commissionFor(1999)).toBe(160); // 159.92
    expect(commissionFor(1)).toBe(0);
    expect(commissionFor(0)).toBe(0);
  });
  it("ignores shipping by default", () => {
    expect(commissionFor(2900, 475)).toBe(232);
  });
  it("can include shipping when configured", () => {
    const cfg = { ...FEES, commission: { ...FEES.commission, appliesToShipping: true } } as unknown as typeof FEES;
    expect(commissionFor(2900, 475, cfg)).toBe(270); // 8% of 3375
  });
});

describe("processing fee estimate", () => {
  it("is 2.9% + 30¢", () => {
    expect(estimateProcessingFee(10000)).toBe(320);
    expect(estimateProcessingFee(3375)).toBe(128); // 97.875 → 98 + 30
    expect(estimateProcessingFee(0)).toBe(0);
  });
});

describe("allocateProportionally", () => {
  it("always sums to the total", () => {
    for (const [total, weights] of [
      [101, [1, 1, 1]],
      [30, [3375, 900]],
      [7, [1, 2, 3, 4]],
      [0, [5, 5]],
      [99999, [1, 333, 7777, 12]],
    ] as Array<[number, number[]]>) {
      const parts = allocateProportionally(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p) => expect(Number.isInteger(p)).toBe(true));
    }
  });
  it("is proportional", () => {
    expect(allocateProportionally(100, [1, 3])).toEqual([25, 75]);
  });
  it("gives everything to the first part when weights are all zero", () => {
    expect(allocateProportionally(10, [0, 0])).toEqual([10, 0]);
  });
});

describe("splitOrder", () => {
  it("single seller: net = gross − commission − processing", () => {
    const s = splitOrder([{ sellerId: "a", itemsCents: 2900, shippingCents: 475, partnerCostCents: 807, partnerShippingCents: 475 }]);
    expect(s.totalCents).toBe(3375);
    expect(s.processingFeeCents).toBe(128);
    const a = s.sellers[0];
    expect(a.commissionCents).toBe(232);
    expect(a.processingFeeCents).toBe(128);
    expect(a.netCents).toBe(3375 - 232 - 128);
    expect(a.estimatedProfitCents).toBe(a.netCents - 807 - 475);
    expect(s.platformCommissionCents).toBe(232);
  });

  it("multi-seller cart: fee is shared by share of the charge and nothing is lost", () => {
    const s = splitOrder(
      [
        { sellerId: "a", itemsCents: 5800, shippingCents: 849, partnerCostCents: 2295, partnerShippingCents: 849 },
        { sellerId: "b", itemsCents: 900, shippingCents: 0, partnerCostCents: 0 },
        { sellerId: "c", itemsCents: 1400, shippingCents: 400, partnerCostCents: 0 },
      ],
      { processingFeeCents: 279 },
    );
    const total = 5800 + 849 + 900 + 1400 + 400;
    expect(s.totalCents).toBe(total);
    // Every cent of the charge is accounted for: sellers' net + commission + Stripe fee.
    const net = s.sellers.reduce((a, x) => a + x.netCents, 0);
    expect(net + s.platformCommissionCents + s.processingFeeCents).toBe(total);
    expect(s.sellers.reduce((a, x) => a + x.processingFeeCents, 0)).toBe(279);
    // Bigger share pays more of the fee.
    expect(s.sellers[0].processingFeeCents).toBeGreaterThan(s.sellers[2].processingFeeCents);
    expect(s.sellers[2].processingFeeCents).toBeGreaterThan(s.sellers[1].processingFeeCents);
  });

  it("uses the actual Stripe fee when given", () => {
    const est = splitOrder([{ sellerId: "a", itemsCents: 1000, shippingCents: 0, partnerCostCents: 0 }]);
    const act = splitOrder([{ sellerId: "a", itemsCents: 1000, shippingCents: 0, partnerCostCents: 0 }], { processingFeeCents: 50 });
    expect(est.processingFeeCents).toBe(59);
    expect(act.sellers[0].netCents).toBe(1000 - 80 - 50);
  });
});

describe("previewEarnings (seller price calculator)", () => {
  it("shows payout and profit for a partner tee", () => {
    const e = previewEarnings({ priceCents: 2900, baseCostCents: 807, shippingCents: 475, partnerBillsShipping: true });
    expect(e.buyerPaysCents).toBe(3375);
    expect(e.commissionCents).toBe(232);
    expect(e.processingFeeCents).toBe(128);
    expect(e.payoutCents).toBe(3015);
    expect(e.partnerBillCents).toBe(1282);
    expect(e.profitCents).toBe(1733);
  });
  it("digital: no partner bill", () => {
    const e = previewEarnings({ priceCents: 900, baseCostCents: 0, shippingCents: 0, partnerBillsShipping: false });
    expect(e.payoutCents).toBe(900 - 72 - 56);
    expect(e.profitCents).toBe(e.payoutCents);
  });
  it("breakEvenPrice is the lowest price with a profit", () => {
    const input = { baseCostCents: 807, shippingCents: 475, partnerBillsShipping: true, minProfitCents: 1 };
    const p = breakEvenPrice(input);
    expect(previewEarnings({ ...input, priceCents: p }).profitCents).toBeGreaterThanOrEqual(1);
    expect(previewEarnings({ ...input, priceCents: p - 1 }).profitCents).toBeLessThan(1);
  });
});

describe("refundImpact", () => {
  const share = { grossCents: 3375, commissionCents: 232, refundedCents: 0 };
  it("full refund returns all commission; seller loses the rest", () => {
    const r = refundImpact(share, 3375);
    expect(r.refundCents).toBe(3375);
    expect(r.commissionReturnedCents).toBe(232);
    expect(r.sellerDebitCents).toBe(3375 - 232);
  });
  it("partial refund returns commission pro rata", () => {
    const r = refundImpact(share, 1000);
    expect(r.commissionReturnedCents).toBe(69); // 232 * 1000/3375 = 68.7
    expect(r.sellerDebitCents).toBe(931);
  });
  it("cannot refund more than what is left", () => {
    const r = refundImpact({ ...share, refundedCents: 3000 }, 1000);
    expect(r.refundCents).toBe(375);
  });
});

describe("payoutReleaseDate (hold rules)", () => {
  const day = 86400000;
  const paidAt = new Date("2026-01-01T00:00:00Z");
  const base = { paidAt, shippedAt: null, deliveredAt: null, buyerConfirmedAt: null, disputeOpen: false };
  it("not before payment or during a dispute", () => {
    expect(payoutReleaseDate({ ...base, kind: "physical", paidAt: null })).toBeNull();
    expect(payoutReleaseDate({ ...base, kind: "physical", deliveredAt: paidAt, disputeOpen: true })).toBeNull();
  });
  it("physical: held until shipped", () => {
    expect(payoutReleaseDate({ ...base, kind: "physical" })).toBeNull();
  });
  it("physical: N days after delivery", () => {
    const deliveredAt = new Date(paidAt.getTime() + 5 * day);
    expect(payoutReleaseDate({ ...base, kind: "physical", shippedAt: paidAt, deliveredAt })!.getTime()).toBe(deliveredAt.getTime() + FEES.payoutHold.daysAfterDelivered * day);
  });
  it("physical: safety net after shipping with no delivery scan", () => {
    const shippedAt = new Date(paidAt.getTime() + 2 * day);
    expect(payoutReleaseDate({ ...base, kind: "physical", shippedAt })!.getTime()).toBe(shippedAt.getTime() + FEES.payoutHold.daysAfterShippedWithoutDelivery * day);
  });
  it("buyer confirmation releases immediately", () => {
    const confirmed = new Date(paidAt.getTime() + day);
    expect(payoutReleaseDate({ ...base, kind: "physical", buyerConfirmedAt: confirmed })).toEqual(confirmed);
  });
  it("digital: N days after payment", () => {
    expect(payoutReleaseDate({ ...base, kind: "digital" })!.getTime()).toBe(paidAt.getTime() + FEES.payoutHold.digitalDays * day);
  });
});
