/**
 * Seller lifecycle: onboarding steps, the $3/month plan, Stripe Connect state,
 * and partner connections.
 */
import "server-only";
import type { Seller, SubscriptionStatus } from "@prisma/client";
import { FEES } from "@/config/fees";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { encryptJson } from "@/lib/crypto";
import { payments } from "@/lib/payments";
import { contextFor, getProvider, webhookUrlFor } from "@/fulfillment/registry";
import { notifySeller } from "./notify";

export interface OnboardingState {
  profile: boolean;
  payouts: boolean;
  plan: boolean;
  fulfillment: boolean;
  approved: boolean;
  canPublish: boolean;
  missing: string[];
}

export async function onboardingState(seller: Seller): Promise<OnboardingState> {
  const connections = await db.partnerConnection.count({ where: { sellerId: seller.id, status: "ACTIVE" } });
  const s = {
    profile: Boolean(seller.shopName && seller.slug),
    payouts: seller.detailsSubmitted,
    plan: seller.subscriptionStatus === "ACTIVE",
    fulfillment: connections > 0 || seller.offersSelfShip || seller.offersDigital,
    approved: seller.status === "APPROVED",
  };
  const missing: string[] = [];
  if (!s.payouts) missing.push("Set up payouts with Stripe");
  if (!s.plan) missing.push(`Start the ${"$" + (FEES.subscription.monthlyCents / 100).toFixed(0)}/month plan`);
  if (!s.fulfillment) missing.push("Connect a partner or choose self-ship / digital");
  return { ...s, canPublish: s.payouts && s.plan && s.fulfillment && seller.status !== "SUSPENDED", missing };
}

// ─── Stripe Connect ──────────────────────────────────────────────────────────

export async function startPayoutOnboarding(seller: Seller & { user: { email: string } }): Promise<string> {
  let accountId = seller.stripeAccountId;
  if (!accountId) {
    const created = await payments().createConnectAccount({ sellerId: seller.id, email: seller.user.email, shopName: seller.shopName });
    accountId = created.accountId;
    await db.seller.update({ where: { id: seller.id }, data: { stripeAccountId: accountId } });
  }
  return payments().createOnboardingLink({
    accountId,
    sellerId: seller.id,
    refreshUrl: `${env.appUrl}/seller/onboarding?stripe=refresh`,
    returnUrl: `${env.appUrl}/seller/onboarding?stripe=return`,
  });
}

export async function syncConnectAccount(accountId: string, state?: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }) {
  const s = state ?? (await payments().getConnectAccount(accountId));
  const seller = await db.seller.findUnique({ where: { stripeAccountId: accountId } });
  if (!seller) return;
  await db.seller.update({
    where: { id: seller.id },
    data: { chargesEnabled: s.chargesEnabled, payoutsEnabled: s.payoutsEnabled, detailsSubmitted: s.detailsSubmitted },
  });
  // Unblock payouts that were waiting for onboarding.
  if (s.payoutsEnabled && !seller.payoutsEnabled) {
    await db.sellerOrder.updateMany({ where: { sellerId: seller.id, payoutStatus: "BLOCKED" }, data: { payoutStatus: "HELD" } });
  }
}

// ─── $3/month plan ───────────────────────────────────────────────────────────

export async function startPlanCheckout(seller: Seller & { user: { email: string } }): Promise<string> {
  let customerId = seller.stripeCustomerId;
  if (!customerId) {
    const c = await payments().createCustomer({ email: seller.user.email, name: seller.shopName, sellerId: seller.id });
    customerId = c.customerId;
    await db.seller.update({ where: { id: seller.id }, data: { stripeCustomerId: customerId } });
  }
  const { url } = await payments().createSubscriptionCheckout({
    customerId,
    sellerId: seller.id,
    successUrl: `${env.appUrl}/seller/onboarding?plan=started`,
    cancelUrl: `${env.appUrl}/seller/onboarding?plan=canceled`,
  });
  return url;
}

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "paused":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    default:
      return "PAST_DUE";
  }
}

/**
 * Apply a plan status change. A lapsed plan pauses the seller's live listings
 * (status PAUSED_BILLING) instead of deleting them; paying again restores them.
 */
export async function applySubscriptionState(
  sellerId: string,
  input: { status: SubscriptionStatus; subscriptionId?: string | null; customerId?: string | null; currentPeriodEnd?: Date | null },
): Promise<void> {
  const seller = await db.seller.findUnique({ where: { id: sellerId } });
  if (!seller) return;
  const before = seller.subscriptionStatus;
  await db.seller.update({
    where: { id: sellerId },
    data: {
      subscriptionStatus: input.status,
      subscriptionId: input.subscriptionId ?? undefined,
      stripeCustomerId: input.customerId ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined,
    },
  });

  const pauseWhen = FEES.subscription.pauseListingsWhen as readonly string[];
  if (pauseWhen.includes(input.status)) {
    const paused = await db.listing.updateMany({
      where: { sellerId, status: "ACTIVE" },
      data: { status: "PAUSED_BILLING", statusReason: "Seller plan payment failed" },
    });
    if (before !== input.status && (paused.count > 0 || before === "ACTIVE")) {
      await notifySeller(sellerId, {
        type: "plan_lapsed",
        title: "Your listings are paused",
        body: `We could not collect your ${"$" + (FEES.subscription.monthlyCents / 100).toFixed(2)} monthly plan, so ${paused.count} listing(s) are paused. Nothing is deleted: update your card and they go live again.`,
        href: "/seller/payouts",
      });
    }
  } else if (input.status === "ACTIVE") {
    const restored = await db.listing.updateMany({
      where: { sellerId, status: "PAUSED_BILLING" },
      data: { status: "ACTIVE", statusReason: null },
    });
    if (restored.count > 0) {
      await notifySeller(sellerId, {
        type: "plan_restored",
        title: "Your listings are live again",
        body: `Thanks for updating your plan. ${restored.count} listing(s) are back in the shop.`,
        href: "/seller/listings",
      });
    }
  }
}

export async function recordPlanPayment(sellerId: string, amountCents: number, invoiceId: string): Promise<void> {
  const exists = await db.ledgerEntry.findFirst({ where: { type: "SUBSCRIPTION", stripeRef: invoiceId, account: "PLATFORM" } });
  if (exists) return;
  await db.ledgerEntry.createMany({
    data: [
      { type: "SUBSCRIPTION", account: "PLATFORM", amountCents, sellerId, stripeRef: invoiceId, memo: "Seller plan" },
      { type: "SUBSCRIPTION", account: "CASH", amountCents, sellerId, stripeRef: invoiceId, memo: "Seller plan" },
    ],
  });
}

// ─── Partner connections ─────────────────────────────────────────────────────

export async function connectPartner(input: {
  sellerId: string;
  providerId: string;
  credentials: Record<string, string> | null;
  demo: boolean;
  authType?: "API_KEY" | "OAUTH" | "NONE";
}): Promise<{ accountLabel: string }> {
  const provider = getProvider(input.providerId);
  if (provider.kind !== "pod") throw new Error("That option does not need a connection.");
  const ctx = { ...contextFor(null), mock: input.demo, credentials: input.demo ? null : input.credentials };
  const verified = await provider.verifyConnection(ctx);
  const connection = await db.partnerConnection.upsert({
    where: { sellerId_provider: { sellerId: input.sellerId, provider: provider.id } },
    create: {
      sellerId: input.sellerId,
      provider: provider.id,
      authType: input.authType ?? (input.demo ? "NONE" : "API_KEY"),
      encryptedCredentials: encryptJson(input.demo ? {} : input.credentials ?? {}),
      accountLabel: verified.accountLabel,
      externalShopId: verified.externalShopId ?? null,
      mock: input.demo,
      status: "ACTIVE",
    },
    update: {
      authType: input.authType ?? (input.demo ? "NONE" : "API_KEY"),
      encryptedCredentials: encryptJson(input.demo ? {} : input.credentials ?? {}),
      accountLabel: verified.accountLabel,
      externalShopId: verified.externalShopId ?? null,
      mock: input.demo,
      status: "ACTIVE",
      lastError: null,
    },
  });
  if (provider.registerWebhooks && !input.demo) {
    await provider.registerWebhooks(contextFor(connection), webhookUrlFor(provider.id)).catch(() => undefined);
  }
  return { accountLabel: verified.accountLabel };
}

export async function disconnectPartner(sellerId: string, providerId: string): Promise<void> {
  const conn = await db.partnerConnection.findUnique({ where: { sellerId_provider: { sellerId, provider: providerId } } });
  if (!conn) return;
  // Listings that depend on it are paused, not deleted.
  await db.listing.updateMany({
    where: { partnerConnectionId: conn.id, status: "ACTIVE" },
    data: { status: "PAUSED", statusReason: `${getProvider(providerId).name} disconnected` },
  });
  await db.partnerConnection.update({ where: { id: conn.id }, data: { status: "REVOKED", encryptedCredentials: encryptJson({}) } });
}
