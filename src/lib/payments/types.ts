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
  reverseTransfer(input: { transferId: string; amountCents: number; idempotencyKey: string }): Promise<{ reversalId: string }>;
  refund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ refundId: string }>;
}
