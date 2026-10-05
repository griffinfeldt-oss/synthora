// Webhooks from fulfillment partners: /api/webhooks/fulfillment/{printify|printful|gelato|…}
// Each adapter verifies its own signature and normalises the payload.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findProvider } from "@/fulfillment/registry";
import { webhookSecret } from "@/fulfillment/shared";
import { verifyConnectionWebhook } from "@/fulfillment/webhook-url";
import { WebhookSignatureError } from "@/fulfillment/types";
import { applyPartnerUpdates } from "@/server/fulfillment";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const adapter = findProvider(providerId);
  if (!adapter || !adapter.capabilities.webhooks) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  const url = new URL(req.url);
  const rawBody = await req.text();
  const query = new URLSearchParams(url.searchParams);

  // Per-connection URL (?c=&sig=): authenticate the connection, then let the adapter parse.
  const connectionId = query.get("c");
  if (connectionId) {
    if (!verifyConnectionWebhook(providerId, connectionId, query.get("sig") ?? "")) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    query.set("token", webhookSecret(`${providerId.toUpperCase()}_WEBHOOK_SECRET`));
  }

  try {
    let updates = await adapter.handleWebhook({ headers: req.headers, rawBody, query });
    if (connectionId) {
      const owned = await db.fulfillment.findMany({
        where: { provider: providerId, connectionId, partnerOrderId: { in: updates.map((u) => u.partnerOrderId) } },
        select: { partnerOrderId: true },
      });
      const ok = new Set(owned.map((o) => o.partnerOrderId));
      updates = updates.filter((u) => ok.has(u.partnerOrderId));
    }
    const applied = await applyPartnerUpdates(providerId, updates);
    return NextResponse.json({ received: updates.length, applied });
  } catch (e) {
    if (e instanceof WebhookSignatureError) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    console.error(`[webhook:${providerId}]`, e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
