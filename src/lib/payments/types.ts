/**
 * Everything the marketplace asks of its payment processor. StripeGateway does
 * it for real; MockGateway simulates it with local pages under /mock/stripe so
 * the whole flow (pay, onboard, subscribe, payout, refund) runs with no keys.
 *
 * Card data never touches this app: buyers pay on Stripe Checkout.
 */

export interface CheckoutLine {
  name: string;
  description?: string;
  imageUrl?: string | null;
  unitAmountCents: number;
  quantity: number;
  taxCode?: string;
}

export interface ConnectAccountState {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface ChargeInfo {
  paymentIntentId: string;
  chargeId: string | null;
  /** Stripe's actual processing fee for the charge, when settled. */
  feeCents: number | null;
}

export interface PaymentGateway {
  readonly mode: "stripe" | "mock";

  createCheckoutSession(input: {
    orderId: string;
    orderNumber: string;
    email: string;
    shipTo?: { name: string; line1: string; line2?: string | null; city: string; state?: string | null; postalCode: string; country: string } | null;
    lines: CheckoutLine[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }>;

  createConnectAccount(input: { sellerId: string; email: string; shopName: string }): Promise<{ accountId: string }>;
  createOnboardingLink(input: { accountId: string; refreshUrl: string; returnUrl: string; sellerId: string }): Promise<string>;
  getConnectAccount(accountId: string): Promise<ConnectAccountState>;
  createDashboardLink(accountId: string): Promise<string>;

  createCustomer(input: { email: string; name: string; sellerId: string }): Promise<{ customerId: string }>;
  createSubscriptionCheckout(input: {
    customerId: string;
    sellerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createBillingPortal(input: { customerId: string; returnUrl: string; sellerId: string }): Promise<string>;

  getChargeInfo(paymentIntentId: string): Promise<ChargeInfo>;
  createTransfer(input: {
    amountCents: number;
    destinationAccountId: string;
    transferGroup: string;
    sourceChargeId: string | null;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ transferId: string }>;
  reverseTransfer(input: { transferId: string; amountCents: number; idempotencyKey: string; metadata?: Record<string, string> }): Promise<{ reversalId: string }>;
  refund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ refundId: string }>;

  // ─── Lookups used to recover uncertain operations and to reconcile ─────────
  // Each returns null when the processor has no record (or, for the mock, no state).

  /** The open checkout URL for a session, if it can still be paid. */
  resumeCheckout(input: { sessionId: string; orderId: string }): Promise<string | null>;
  findTransfer(input: { transferGroup: string; opKey: string }): Promise<{ transferId: string } | null>;
  findRefund(input: { paymentIntentId: string; opKey: string }): Promise<{ refundId: string } | null>;
  findReversal(input: { transferId: string; opKey: string }): Promise<{ reversalId: string } | null>;
  getPaymentSummary(paymentIntentId: string): Promise<PaymentSummary | null>;
  getTransferSummary(transferId: string): Promise<{ amountCents: number; reversedCents: number } | null>;
}

export interface PaymentSummary {
  status: string;
  currency: string;
  amountReceivedCents: number;
  amountRefundedCents: number;
  feeCents: number | null;
}
