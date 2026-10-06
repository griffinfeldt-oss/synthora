import { MockGateway } from "@/lib/payments/mock";

/** Error shaped like the Stripe SDK's network error: the request may or may not have landed. */
export class FakeConnectionError extends Error {
  type = "StripeConnectionError";
}

/** Error shaped like a Stripe refusal (4xx): definitely did not happen. */
export class FakeRefusal extends Error {
  type = "StripeInvalidRequestError";
  statusCode = 400;
}

type Fault = "lose-response" | "refuse" | null;

/**
 * A payment processor with memory, so tests can check that money moved exactly
 * once and simulate crashes: "lose-response" performs the effect and then throws a
 * network error, as if the process died before reading Stripe's reply.
 */
export class RecordingGateway extends MockGateway {
  transfers: Array<{ id: string; amountCents: number; transferGroup: string; opKey?: string; key: string }> = [];
  refunds: Array<{ id: string; amountCents: number; paymentIntentId: string; opKey?: string; key: string }> = [];
  reversals: Array<{ id: string; transferId: string; amountCents: number; opKey?: string; key: string }> = [];
  fees = new Map<string, number | null>();
  nextTransferFault: Fault = null;
  nextRefundFault: Fault = null;
  nextReversalFault: Fault = null;
  private seq = 0;

  private take(kind: "nextTransferFault" | "nextRefundFault" | "nextReversalFault"): Fault {
    const f = this[kind];
    this[kind] = null;
    return f;
  }

  async createTransfer(input: { amountCents: number; transferGroup: string; idempotencyKey: string; metadata: Record<string, string> }) {
    const existing = this.transfers.find((t) => t.key === input.idempotencyKey);
    if (existing) return { transferId: existing.id };
    const fault = this.take("nextTransferFault");
    if (fault === "refuse") throw new FakeRefusal("Insufficient funds in platform balance");
    const t = { id: `tr_rec_${++this.seq}`, amountCents: input.amountCents, transferGroup: input.transferGroup, opKey: input.metadata.opKey, key: input.idempotencyKey };
    this.transfers.push(t);
    if (fault === "lose-response") throw new FakeConnectionError("socket hang up");
    return { transferId: t.id };
  }

  async findTransfer(input: { transferGroup: string; opKey: string }) {
    const t = this.transfers.find((x) => x.transferGroup === input.transferGroup && x.opKey === input.opKey);
    return t ? { transferId: t.id } : null;
  }

  async refund(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string; metadata: Record<string, string> }) {
    const existing = this.refunds.find((r) => r.key === input.idempotencyKey);
    if (existing) return { refundId: existing.id };
    const fault = this.take("nextRefundFault");
    if (fault === "refuse") throw new FakeRefusal("Charge already refunded");
    const r = { id: `re_rec_${++this.seq}`, amountCents: input.amountCents, paymentIntentId: input.paymentIntentId, opKey: input.metadata.opKey, key: input.idempotencyKey };
    this.refunds.push(r);
    if (fault === "lose-response") throw new FakeConnectionError("timeout");
    return { refundId: r.id };
  }

  async findRefund(input: { paymentIntentId: string; opKey: string }) {
    const r = this.refunds.find((x) => x.paymentIntentId === input.paymentIntentId && x.opKey === input.opKey);
    return r ? { refundId: r.id } : null;
  }

  async reverseTransfer(input: { transferId: string; amountCents: number; idempotencyKey: string; metadata?: Record<string, string> }) {
    const existing = this.reversals.find((r) => r.key === input.idempotencyKey);
    if (existing) return { reversalId: existing.id };
    const fault = this.take("nextReversalFault");
    if (fault === "refuse") throw new FakeRefusal("Insufficient funds in the connected account");
    const r = { id: `trr_rec_${++this.seq}`, transferId: input.transferId, amountCents: input.amountCents, opKey: input.metadata?.opKey, key: input.idempotencyKey };
    this.reversals.push(r);
    if (fault === "lose-response") throw new FakeConnectionError("timeout");
    return { reversalId: r.id };
  }

  async findReversal(input: { transferId: string; opKey: string }) {
    const r = this.reversals.find((x) => x.transferId === input.transferId && x.opKey === input.opKey);
    return r ? { reversalId: r.id } : null;
  }

  async getChargeInfo(paymentIntentId: string) {
    return { paymentIntentId, chargeId: paymentIntentId.replace(/^pi_/, "ch_"), feeCents: this.fees.get(paymentIntentId) ?? null };
  }
}
