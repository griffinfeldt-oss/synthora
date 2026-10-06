"use server";

import { db } from "@/lib/db";
import { contextFor, getProvider } from "@/fulfillment/registry";
import type { CatalogProduct } from "@/fulfillment/types";
import { requireSeller } from "@/server/session";
import { draftCopy, generateDesigns, partnerMockups, StudioError } from "@/server/studio";
import { createListing, ListingError, listingInputSchema } from "@/server/listings";

export async function catalogAction(providerId: string): Promise<CatalogProduct[] | { error: string }> {
  const { seller } = await requireSeller();
  const provider = getProvider(providerId);
  try {
    if (provider.kind !== "pod") return await provider.listCatalog(contextFor(null));
    const connection = await db.partnerConnection.findUnique({ where: { sellerId_provider: { sellerId: seller.id, provider: providerId } } });
    if (!connection || connection.status !== "ACTIVE") return { error: `Connect ${provider.name} first.` };
    return await provider.listCatalog(contextFor(connection));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load the catalog." };
  }
}

export async function generateAction(input: { prompt: string; productType: string }) {
  const { seller } = await requireSeller();
  try {
    return await generateDesigns({ seller, prompt: input.prompt, productType: input.productType });
  } catch (e) {
    if (e instanceof StudioError) return { error: e.message };
    console.error(e);
    return { error: "The image model could not make designs right now." };
  }
}

export async function mockupsAction(input: { providerId: string; partnerProductId: string; variantIds: string[]; designAssetId: string }) {
  const { seller } = await requireSeller();
  return partnerMockups({ sellerId: seller.id, ...input });
}

export async function copyAction(input: { prompt: string; productType: string; aiTool: string; providerId: string }) {
  const { seller } = await requireSeller();
  return draftCopy({ seller, prompt: input.prompt, productTypeId: input.productType, aiTool: input.aiTool, providerId: input.providerId });
}

export async function createListingAction(
  raw: unknown,
): Promise<{ ok: true; slug: string; id: string; status: string; missing: string[]; problems: string[] } | { ok: false; error: string }> {
  const { seller } = await requireSeller();
  const parsed = listingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the listing details." };
  try {
    // Ownership of every file, the generation link and partner photos are checked in createListing.
    const res = await createListing(seller, parsed.data);
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof ListingError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Could not create the listing." };
  }
}
