/**
 * Stripe webhook dispatcher. Each event is processed once (WebhookEvent table).
 * Handlers are the same functions the mock pages call, so mock mode exercises
 * the same code.
 */
import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { markOrderPaid, cancelPendingOrder } from "./orders";
import { onDisputeClosed, onDisputeCreated, syncExternalRefund } from "./refunds";
import { applySubscriptionState, mapStripeSubscriptionStatus, recordPlanPayment, syncConnectAccount } from "./sellers";

const id = (v: string | { id: string } | null | undefined): string | null => (v ? (typeof v === "string" ? v : v.id) : null);

async function sellerIdFor(input: { metadata?: Stripe.Metadata | null; customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null }) {
  if (input.metadata?.sellerId) return input.metadata.sellerId;
  const customerId = id(input.customer as string | { id: string } | null);
  if (!customerId) return null;
  const seller = await db.seller.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return seller?.id ?? null;
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const end = sub.items?.data?.[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  const key = `stripe:${event.id}`;
  const claimed = await db.webhookEvent.createMany({ data: [{ id: key, source: "stripe", type: event.type }], skipDuplicates: true });
  if (claimed.count === 0) return "duplicate";

  try {
    const handled = await dispatch(event);
    return handled ? "processed" : "ignored";
  } catch (e) {
    // Let Stripe retry: forget we saw it.
    await db.webhookEvent.delete({ where: { id: key } }).catch(() => undefined);
    throw e;
  }
}

async function dispatch(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.metadata?.kind === "order" && s.payment_status === "paid") {
        await markOrderPaid({ orderId: s.metadata.orderId, paymentIntentId: id(s.payment_intent)! });
        return true;
      }
      if (s.metadata?.kind === "subscription" && s.mode === "subscription") {
        const sellerId = s.metadata.sellerId;
        await applySubscriptionState(sellerId, {
          status: "ACTIVE",
          subscriptionId: id(s.subscription),
          customerId: id(s.customer),
        });
        return true;
      }
      return false;
    }

    case "checkout.session.expired": {
      const s = event.data.object;
      if (s.metadata?.kind === "order") await cancelPendingOrder(s.metadata.orderId);
      return true;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const pi = id(charge.payment_intent);
      if (pi) await syncExternalRefund(pi, charge.amount_refunded);
      return true;
    }

    case "charge.dispute.created": {
      const d = event.data.object;
      const pi = id(d.payment_intent);
      if (pi) await onDisputeCreated({ paymentIntentId: pi, disputeId: d.id, amountCents: d.amount, reason: d.reason });
      return true;
    }

    case "charge.dispute.closed": {
      const d = event.data.object;
      await onDisputeClosed({ disputeId: d.id, won: d.status === "won" });
      return true;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const sellerId = await sellerIdFor(sub);
      if (!sellerId) return false;
      await applySubscriptionState(sellerId, {
        status: event.type === "customer.subscription.deleted" ? "CANCELED" : mapStripeSubscriptionStatus(sub.status),
        subscriptionId: sub.id,
        customerId: id(sub.customer),
        currentPeriodEnd: periodEnd(sub),
      });
      return true;
    }

    case "invoice.paid": {
      const inv = event.data.object;
      const sellerId = await sellerIdFor({ customer: inv.customer, metadata: inv.parent?.subscription_details?.metadata });
      if (!sellerId || !inv.id) return false;
      await recordPlanPayment(sellerId, inv.amount_paid, inv.id);
      await applySubscriptionState(sellerId, { status: "ACTIVE" });
      return true;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object;
      const sellerId = await sellerIdFor({ customer: inv.customer, metadata: inv.parent?.subscription_details?.metadata });
      if (!sellerId) return false;
      await applySubscriptionState(sellerId, { status: "PAST_DUE" });
      return true;
    }

    case "account.updated": {
      const a = event.data.object;
      await syncConnectAccount(a.id, {
        chargesEnabled: Boolean(a.charges_enabled),
        payoutsEnabled: Boolean(a.payouts_enabled),
        detailsSubmitted: Boolean(a.details_submitted),
      });
      return true;
    }

    default:
      return false;
  }
}
