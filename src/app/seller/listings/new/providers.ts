import "server-only";
import type { Seller } from "@prisma/client";
import { db } from "@/lib/db";
import { getProvider } from "@/fulfillment/registry";
import type { WizardProvider } from "./ai/AiWizard";

/** Fulfillment options this seller can list with right now. */
export async function sellerProviders(seller: Seller): Promise<WizardProvider[]> {
  const connections = await db.partnerConnection.findMany({ where: { sellerId: seller.id, status: "ACTIVE" } });
  const out: WizardProvider[] = connections.map((c) => {
    const p = getProvider(c.provider);
    return { id: p.id, name: p.name, kind: p.kind, productTypes: p.productTypes, mock: c.mock, mockups: p.capabilities.mockups };
  });
  for (const id of [seller.offersSelfShip ? "self" : null, seller.offersDigital ? "digital" : null]) {
    if (!id) continue;
    const p = getProvider(id);
    out.push({ id: p.id, name: p.name, kind: p.kind, productTypes: p.productTypes, mock: false, mockups: false });
  }
  return out;
}
