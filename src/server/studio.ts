/**
 * Backend for "Make one with AI": generate four designs, render mockups,
 * draft the listing copy.
 *
 * Every call is budgeted (src/server/usage.ts), time-limited and recorded.
 * Design originals are stored privately; only reduced previews are public.
 */
import "server-only";
import type { Seller } from "@prisma/client";
import { productType } from "@/config/catalog";
import { LAUNCH } from "@/config/launch";
import { db } from "@/lib/db";
import { isLive } from "@/lib/env";
import { publicUrl } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { copywriter, getImageModel, mockCopywriter } from "@/ai";
import type { ListingCopy } from "@/ai/types";
import { contextFor, getProvider } from "@/fulfillment/registry";
import { AssetError, ownedAssets, signedOriginalUrl, storeOriginal } from "./assets";
import { aiEligibility, BudgetError, commitUsage, releaseUsage, reserveUsage } from "./usage";

export class StudioError extends Error {}

export interface GeneratedDesign {
  /** The private original. */
  assetId: string;
  previewUrl: string;
  seed: number;
  width: number | null;
  height: number | null;
}

export async function generateDesigns(input: { seller: Seller; prompt: string; productType: string; modelId?: string | null }) {
  const prompt = input.prompt.trim().slice(0, 600);
  if (prompt.length < 3) throw new StudioError("Describe the design in a few words.");
  const blocked = aiEligibility(input.seller);
  if (blocked) throw new StudioError(blocked);
  const model = getImageModel(input.modelId);
  if (model.demo && isLive()) throw new StudioError("The AI studio is not available yet.");

  const count = 4;
  const estCost = model.estCostCentsPerImage * count;
  let reservationId: string;
  try {
    reservationId = await reserveUsage(input.seller.id, "image", count, estCost);
  } catch (e) {
    if (e instanceof BudgetError) throw new StudioError(e.message);
    throw e;
  }

  const generation = await db.generation.create({
    data: { sellerId: input.seller.id, model: model.label, prompt, productType: input.productType, status: "RUNNING", images: [], reservationId },
  });
  try {
    const images = await model.generate({ prompt, productType: input.productType, count, signal: AbortSignal.timeout(LAUNCH.ai.timeoutMs) });
    const stored: GeneratedDesign[] = [];
    const base = slugify(prompt).slice(0, 40) || "design";
    for (const [i, img] of images.entries()) {
      const { original, preview } = await storeOriginal({
        sellerId: input.seller.id,
        kind: "GENERATED_DESIGN",
        bytes: img.data,
        contentType: img.contentType,
        ext: img.ext,
        // What a buyer's download will be called.
        fileName: `${base}-${i + 1}.${img.ext}`,
        generationId: generation.id,
      });
      stored.push({ assetId: original.id, previewUrl: publicUrl(preview!.storageKey), seed: img.seed, width: original.width, height: original.height });
    }
    await db.generation.update({ where: { id: generation.id }, data: { status: "SUCCEEDED", images: stored as object[], costCents: estCost } });
    await commitUsage(reservationId, estCost);
    return { generationId: generation.id, model: model.label, demoModel: Boolean(model.demo), images: stored };
  } catch (e) {
    const message = e instanceof Error && e.name === "TimeoutError" ? "The image model took too long. Nothing was charged; try again." : e instanceof Error ? e.message : "Generation failed";
    await db.generation.update({ where: { id: generation.id }, data: { status: "FAILED", error: message.slice(0, 500) } });
    await releaseUsage(reservationId);
    throw new StudioError(message);
  }
}

/** Partner-rendered photos if the partner has a mockup API and a live connection; otherwise null. */
export async function partnerMockups(input: {
  sellerId: string;
  providerId: string;
  partnerProductId: string;
  variantIds: string[];
  designAssetId: string;
}): Promise<string[] | null> {
  const provider = getProvider(input.providerId);
  if (!provider.createMockups) return null;
  const connection = await db.partnerConnection.findUnique({
    where: { sellerId_provider: { sellerId: input.sellerId, provider: provider.id } },
  });
  if (!connection || connection.mock) return null;
  let design;
  try {
    design = (await ownedAssets(input.sellerId, [input.designAssetId])).get(input.designAssetId)!;
  } catch (e) {
    if (e instanceof AssetError) return null;
    throw e;
  }
  const catalog = await provider.listCatalog(contextFor(connection));
  const product = catalog.find((p) => p.id === input.partnerProductId);
  try {
    return await provider.createMockups(contextFor(connection), {
      partnerProductId: input.partnerProductId,
      partnerVariantIds: input.variantIds.length ? input.variantIds : product?.variants.slice(0, 1).map((v) => v.id) ?? [],
      // The partner fetches the private original through a short-lived signed link.
      designUrl: await signedOriginalUrl(design, 3600),
      partnerData: product?.data ?? null,
    });
  } catch {
    return null;
  }
}

/**
 * Listing copy. Uses Claude when configured (budgeted like images); if that fails
 * the template writer is used and labelled as such, never passed off as Claude.
 */
export async function draftCopy(input: { seller: Seller; prompt: string; productTypeId: string; aiTool: string; providerId: string }): Promise<ListingCopy & { writer: string; fallback: boolean }> {
  const args = {
    prompt: input.prompt,
    productLabel: productType(input.productTypeId).label,
    aiTool: input.aiTool,
    partnerName: (() => {
      const p = getProvider(input.providerId);
      return p.kind === "pod" ? p.name : "";
    })(),
  };
  const writer = copywriter();
  if (writer.demo || aiEligibility(input.seller)) {
    return { ...(await mockCopywriter.write(args)), writer: mockCopywriter.label, fallback: !writer.demo };
  }
  let reservationId: string | null = null;
  try {
    reservationId = await reserveUsage(input.seller.id, "copy", 1, LAUNCH.ai.estCopyCostCents);
    const out = await writer.write(args, { signal: AbortSignal.timeout(LAUNCH.ai.timeoutMs) });
    await commitUsage(reservationId, LAUNCH.ai.estCopyCostCents);
    return { ...out, writer: writer.label, fallback: false };
  } catch {
    if (reservationId) await releaseUsage(reservationId);
    return { ...(await mockCopywriter.write(args)), writer: `${mockCopywriter.label}, because ${writer.label} was unavailable`, fallback: true };
  }
}
