import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { webhookUrlFor } from "./registry";
import { webhookSecret } from "./shared";

/**
 * Per-connection webhook URLs, for partners where each seller registers the
 * webhook in their own dashboard (Gelato). The signature ties the URL to one
 * connection, so it can only update that seller's orders and never reveals the
 * platform secret.
 */
export function connectionWebhookSig(providerId: string, connectionId: string): string {
  const env = `${providerId.toUpperCase()}_WEBHOOK_SECRET`;
  return createHmac("sha256", webhookSecret(env)).update(`conn:${connectionId}`).digest("base64url");
}

export function connectionWebhookUrl(providerId: string, connectionId: string): string {
  return `${webhookUrlFor(providerId)}?c=${connectionId}&sig=${connectionWebhookSig(providerId, connectionId)}`;
}

export function verifyConnectionWebhook(providerId: string, connectionId: string, sig: string): boolean {
  try {
    return safeEqual(connectionWebhookSig(providerId, connectionId), sig);
  } catch {
    return false;
  }
}
