import "server-only";
import { ALL_PROVIDERS } from "./registry.generated";
import type { FulfillmentProvider, ProviderContext } from "./types";
import { decryptJson } from "@/lib/crypto";
import { env, mock } from "@/lib/env";

// Built-in options first, then partners alphabetically.
const ORDER = ["self", "digital"];
export const providers: FulfillmentProvider[] = [...ALL_PROVIDERS].sort((a, b) => {
  const ai = ORDER.indexOf(a.id);
  const bi = ORDER.indexOf(b.id);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return a.name.localeCompare(b.name);
});

export function getProvider(id: string): FulfillmentProvider {
  const p = providers.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown fulfillment provider "${id}"`);
  return p;
}

export function findProvider(id: string): FulfillmentProvider | undefined {
  return providers.find((x) => x.id === id);
}

export const partnerProviders = () => providers.filter((p) => p.kind === "pod");

export function isOAuthAvailable(p: FulfillmentProvider): boolean {
  return Boolean(p.auth.oauth && p.auth.oauth.enabledEnv.every((k) => process.env[k]));
}

/** Build the adapter context for a seller's stored connection. */
export function contextFor(
  connection: { encryptedCredentials: string; mock: boolean; externalShopId: string | null; id: string } | null,
): ProviderContext {
  if (!connection) return { credentials: null, mock: true, appUrl: env.appUrl };
  const isMock = connection.mock || mock.fulfillment;
  return {
    credentials: isMock ? null : decryptJson<Record<string, string>>(connection.encryptedCredentials),
    mock: isMock,
    externalShopId: connection.externalShopId,
    connectionId: connection.id,
    appUrl: env.appUrl,
  };
}

export function webhookUrlFor(providerId: string): string {
  return `${env.appUrl}/api/webhooks/fulfillment/${providerId}`;
}
