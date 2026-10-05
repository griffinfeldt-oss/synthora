/**
 * Stripe Connect (Express) with separate charges and transfers:
 *  - The buyer pays the platform once for the whole cart (Checkout, mode=payment).
 *  - After the hold, the platform transfers each seller's net to their Express
 *    account (transfers.create with source_transaction, so it works before the
 *    charge's funds settle) and keeps the commission.
 *  - Sellers pay $3/month through Stripe Billing (Checkout, mode=subscription).
 */
import "server-only";
import Stripe from "stripe";
import { FEES } from "@/config/fees";
import { env } from "@/lib/env";
import type { PaymentGateway } from "./types";

let stripe: Stripe | null = null;
export function stripeClient(): Stripe {
  stripe ??= new Stripe(env.stripeSecretKey, {
    appInfo: { name: "Synthora", url: env.appUrl },
    maxNetworkRetries: 2,
  });
  return stripe;
}

export class StripeGateway implements PaymentGateway {
  readonly mode = "stripe" as const;

  async createCheckoutSession(input: Parameters<PaymentGateway["createCheckoutSession"]>[0]) {
    const session = await stripeClient().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: input.email,
        client_reference_id: input.orderId,
        line_items: input.lines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: FEES.currency,
            unit_amount: l.unitAmountCents,
            product_data: {
              name: l.name,
              description: l.description,
              images: l.imageUrl?.startsWith("https://") ? [l.imageUrl] : undefined,
            },
          },
        })),
        payment_intent_data: {
          transfer_group: input.orderId,
          description: `Synthora order ${input.orderNumber}`,
          metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
        },
        metadata: { orderId: input.orderId, kind: "order" },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      },
      { idempotencyKey: `checkout-${input.orderId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url };
  }

  async createConnectAccount(input: { sellerId: string; email: string; shopName: string }) {
    const account = await stripeClient().accounts.create(
      {
        type: "express",
        email: input.email,
        capabilities: { transfers: { requested: true } },
        business_profile: {
          name: input.shopName,
          // Stripe rejects localhost URLs here.
          url: env.appUrl.includes("localhost") ? undefined : env.appUrl,
          product_description: "AI-made products sold on Synthora",
        },
        metadata: { sellerId: input.sellerId },
      },
      { idempotencyKey: `connect-${input.sellerId}` },
    );
    return { accountId: account.id };
  }

  async createOnboardingLink(input: { accountId: string; refreshUrl: string; returnUrl: string }) {
    const link = await stripeClient().accountLinks.create({
      account: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: "account_onboarding",
    });
    return link.url;
  }

  async getConnectAccount(accountId: string) {
    const a = await stripeClient().accounts.retrieve(accountId);
    return {
      chargesEnabled: Boolean(a.charges_enabled),
      payoutsEnabled: Boolean(a.payouts_enabled),
      detailsSubmitted: Boolean(a.details_submitted),
    };
  }

  async createDashboardLink(accountId: string) {
    const link = await stripeClient().accounts.createLoginLink(accountId);
    return link.url;
  }

  async createCustomer(input: { email: string; name: string; sellerId: string }) {
    const c = await stripeClient().customers.create(
      { email: input.email, name: input.name, metadata: { sellerId: input.sellerId } },
      { idempotencyKey: `customer-${input.sellerId}` },
    );
    return { customerId: c.id };
  }

  async createSubscriptionCheckout(input: { customerId: string; sellerId: string; successUrl: string; cancelUrl: string }) {
    const lineItem = env.stripeSubscriptionPriceId
      ? { price: env.stripeSubscriptionPriceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: FEES.currency,
            unit_amount: FEES.subscription.monthlyCents,
            recurring: { interval: "month" as const },
            product_data: { name: FEES.subscription.productName },
          },
        };
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [lineItem],
      subscription_data: { metadata: { sellerId: input.sellerId } },
      metadata: { sellerId: input.sellerId, kind: "subscription" },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  async createBillingPortal(input: { customerId: string; returnUrl: string }) {
    const s = await stripeClient().billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return s.url;
  }

  async getChargeInfo(paymentIntentId: string) {
    const pi = await stripeClient().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    return {
      paymentIntentId: pi.id,
      chargeId: charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null),
      feeCents: bt ? bt.fee : null,
    };
  }

  async createTransfer(input: Parameters<PaymentGateway["createTransfer"]>[0]) {
    const t = await stripeClient().transfers.create(
      {
        amount: input.amountCents,
        currency: FEES.currency,
        destination: input.destinationAccountId,
        transfer_group: input.transferGroup,
        source_transaction: input.sourceChargeId ?? undefined,
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { transferId: t.id };
  }

  async reverseTransfer(input: { transferId: string; amountCents: number; idempotencyKey: string }) {
    const r = await stripeClient().transfers.createReversal(
      input.transferId,
      { amount: input.amountCents },
      { idempotencyKey: input.idempotencyKey },
    );
    return { reversalId: r.id };
  }

  async refund(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string; metadata: Record<string, string> }) {
    const r = await stripeClient().refunds.create(
      { payment_intent: input.paymentIntentId, amount: input.amountCents, metadata: input.metadata },
      { idempotencyKey: input.idempotencyKey },
    );
    return { refundId: r.id };
  }
}
