"use server";

// Simulated Stripe. Every action refuses to run unless the app is in mock mode,
// and each one calls the same handler the real Stripe webhook would.
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { estimateProcessingFee } from "@/lib/fees";
import { FEES } from "@/config/fees";
import { markOrderPaid } from "@/server/orders";
import { requireSeller } from "@/server/session";
import { applySubscriptionState, recordPlanPayment, syncConnectAccount } from "@/server/sellers";

function guard() {
  if (!mock.stripe) notFound();
}

function safeReturn(url: string, fallback: string) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url.startsWith("/") && !url.startsWith("//") ? url : fallback;
  }
}

export async function mockPayAction(formData: FormData) {
  guard();
  const orderId = String(formData.get("orderId"));
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await markOrderPaid({
    orderId,
    paymentIntentId: `pi_mock_${orderId}`,
    chargeId: `ch_mock_${orderId}`,
    feeCents: estimateProcessingFee(order.totalCents),
  });
  redirect(`/checkout/success?order=${order.id}&t=${order.accessToken}`);
}

export async function mockConnectAction(formData: FormData) {
  guard();
  const { seller } = await requireSeller();
  const account = String(formData.get("account"));
  if (seller.stripeAccountId !== account) throw new Error("This onboarding link belongs to another account.");
  await syncConnectAccount(account, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
  redirect(safeReturn(String(formData.get("return")), "/seller/onboarding"));
}

export async function mockSubscribeAction(formData: FormData) {
  guard();
  const { seller } = await requireSeller();
  await applySubscriptionState(seller.id, {
    status: "ACTIVE",
    subscriptionId: seller.subscriptionId ?? `sub_mock_${seller.id}`,
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
  });
  await recordPlanPayment(seller.id, FEES.subscription.monthlyCents, `in_mock_${seller.id}_${Date.now()}`);
  redirect(safeReturn(String(formData.get("return")), "/seller/onboarding"));
}

export async function mockBillingAction(formData: FormData) {
  guard();
  const { seller } = await requireSeller();
  const op = String(formData.get("op"));
  if (op === "fail") {
    await applySubscriptionState(seller.id, { status: "PAST_DUE" });
  } else if (op === "cancel") {
    await applySubscriptionState(seller.id, { status: "CANCELED" });
  } else if (op === "pay") {
    await applySubscriptionState(seller.id, { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) });
    await recordPlanPayment(seller.id, FEES.subscription.monthlyCents, `in_mock_${seller.id}_${Date.now()}`);
  }
  redirect(safeReturn(String(formData.get("return")), "/seller/payouts"));
}
