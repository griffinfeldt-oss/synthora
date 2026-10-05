// Stripe webhooks. Point both the platform endpoint and the Connect endpoint here;
// the signature is checked against each configured secret.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env, mock } from "@/lib/env";
import { stripeClient } from "@/lib/payments/stripe";
import { handleStripeEvent } from "@/server/stripe-webhooks";

export async function POST(req: Request) {
  if (mock.stripe) return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const raw = await req.text();

  let event: Stripe.Event | null = null;
  for (const secret of [env.stripeWebhookSecret, env.stripeConnectWebhookSecret].filter(Boolean)) {
    try {
      event = stripeClient().webhooks.constructEvent(raw, sig, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  try {
    const result = await handleStripeEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
