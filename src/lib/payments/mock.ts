/**
 * Mock payment processor. Returns ids shaped like Stripe's and sends people to
 * local pages under /mock/stripe that stand in for Checkout, Connect onboarding
 * and the billing portal. Those pages call the same handlers the real Stripe
 * webhooks call, so every downstream step is exercised.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { estimateProcessingFee } from "@/lib/fees";
import { env } from "@/lib/env";
import type { PaymentGateway } from "./types";

const id = (prefix: string) => `${prefix}_mock_${randomBytes(8).toString("hex")}`;

export class MockGateway implements PaymentGateway {
  readonly mode = "mock" as const;

  async createCheckoutSession(input: Parameters<PaymentGateway["createCheckoutSession"]>[0]) {
    const sessionId = `cs_mock_${input.orderId}`;
    return { id: sessionId, url: `${env.appUrl}/mock/stripe/checkout/${input.orderId}` };
  }

  async createConnectAccount() {
    return { accountId: id("acct") };
  }

  async createOnboardingLink(input: { accountId: string; returnUrl: string; sellerId: string }) {
    const q = new URLSearchParams({ account: input.accountId, return: input.returnUrl });
    return `${env.appUrl}/mock/stripe/connect?${q.toString()}`;
  }

  async getConnectAccount() {
    // State lives on the Seller row in mock mode (set by the mock onboarding page).
    return { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true };
  }

  async createDashboardLink() {
    return `${env.appUrl}/mock/stripe/dashboard`;
  }

  async createCustomer() {
    return { customerId: id("cus") };
  }

  async createSubscriptionCheckout(input: { sellerId: string; successUrl: string }) {
    const q = new URLSearchParams({ return: input.successUrl });
    return { url: `${env.appUrl}/mock/stripe/subscribe?${q.toString()}` };
  }

  async createBillingPortal(input: { returnUrl: string }) {
    return `${env.appUrl}/mock/stripe/billing?${new URLSearchParams({ return: input.returnUrl }).toString()}`;
  }

  async getChargeInfo(paymentIntentId: string): Promise<{ paymentIntentId: string; chargeId: string | null; feeCents: number | null }> {
    return { paymentIntentId, chargeId: paymentIntentId.replace(/^pi_/, "ch_"), feeCents: null };
  }

  async createTransfer(_input: Parameters<PaymentGateway["createTransfer"]>[0]) {
    return { transferId: id("tr") };
  }

  async reverseTransfer(_input: Parameters<PaymentGateway["reverseTransfer"]>[0]) {
    return { reversalId: id("trr") };
  }

  async refund(_input: Parameters<PaymentGateway["refund"]>[0]) {
    return { refundId: id("re") };
  }

  /** What the mock checkout reports as Stripe's fee. */
  static feeFor(totalCents: number): number {
    return estimateProcessingFee(totalCents);
  }

  async resumeCheckout(input: { orderId: string }) {
    return `${env.appUrl}/mock/stripe/checkout/${input.orderId}`;
  }

  // The mock keeps no state of its own, so it has nothing to look up.
  async findTransfer(_input: Parameters<PaymentGateway["findTransfer"]>[0]): Promise<{ transferId: string } | null> {
    return null;
  }

  async findRefund(_input: Parameters<PaymentGateway["findRefund"]>[0]): Promise<{ refundId: string } | null> {
    return null;
  }

  async findReversal(_input: Parameters<PaymentGateway["findReversal"]>[0]): Promise<{ reversalId: string } | null> {
    return null;
  }

  async getPaymentSummary() {
    return null;
  }

  async getTransferSummary() {
    return null;
  }
}
