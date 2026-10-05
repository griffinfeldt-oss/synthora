"use server";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { fetchPublicBytes, putObject } from "@/lib/storage";
import { contextFor, getProvider } from "@/fulfillment/registry";
import type { CatalogProduct } from "@/fulfillment/types";
import { requireSeller } from "@/server/session";
import { draftCopy, generateDesigns, partnerMockups } from "@/server/studio";
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
  // Light rate limit: 30 generations per seller per hour.
  const recent = await db.generation.count({ where: { sellerId: seller.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= 30) return { error: "You've made a lot of designs this hour. Try again shortly." };
  try {
    return await generateDesigns({ sellerId: seller.id, prompt: input.prompt, productType: input.productType });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The image model could not make designs right now." };
  }
}

export async function mockupsAction(input: { providerId: string; partnerProductId: string; variantIds: string[]; designUrl: string }) {
  const { seller } = await requireSeller();
  return partnerMockups({ sellerId: seller.id, ...input });
}

export async function copyAction(input: { prompt: string; productType: string; aiTool: string; providerId: string }) {
  await requireSeller();
  return draftCopy({ prompt: input.prompt, productTypeId: input.productType, aiTool: input.aiTool, providerId: input.providerId });
}

export async function createListingAction(raw: unknown): Promise<{ ok: true; slug: string; id: string; status: string; missing: string[] } | { ok: false; error: string }> {
  const { seller } = await requireSeller();
  const parsed = listingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the listing details." };
  const input = parsed.data;

  // Every image and design must be one this seller generated or uploaded.
  const own = (url: string) => url.includes(`/${seller.id}/`) || /^https:\/\/(files\.cdn\.printful\.com|images-api\.printify\.com)\//.test(url);
  if (![...input.images.map((i) => i.url), input.designUrl ?? ""].filter(Boolean).every(own)) {
    return { ok: false, error: "Images must be uploaded or generated in your account." };
  }

  if (input.digitalAsset && !input.digitalAsset.storageKey.startsWith(`digital/${seller.id}/`)) {
    return { ok: false, error: "That file was not uploaded from your account." };
  }

  // Digital listings made in the studio sell the design file itself: copy it to private storage.
  if (input.kind === "DIGITAL" && !input.digitalAsset && input.designUrl) {
    const bytes = await fetchPublicBytes(input.designUrl);
    if (!bytes) return { ok: false, error: "Could not read the design file." };
    const ext = input.designUrl.split(".").pop()?.split("?")[0] ?? "png";
    const fileName = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.${ext}`;
    const key = `digital/${seller.id}/${randomBytes(6).toString("hex")}/${fileName}`;
    await putObject(key, bytes, ext === "svg" ? "image/svg+xml" : `image/${ext}`, "private");
    input.digitalAsset = { storageKey: key, fileName, contentType: ext === "svg" ? "image/svg+xml" : `image/${ext}`, sizeBytes: bytes.length };
  }

  try {
    const res = await createListing(seller, input);
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof ListingError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Could not create the listing." };
  }
}
