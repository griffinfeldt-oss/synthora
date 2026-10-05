/**
 * Backend for "Make one with AI": generate four designs, render mockups,
 * draft the listing copy.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { absoluteUrl, putObject } from "@/lib/storage";
import { copywriter, getImageModel, mockCopywriter } from "@/ai";
import type { ListingCopy } from "@/ai/types";
import { contextFor, getProvider } from "@/fulfillment/registry";

export async function generateDesigns(input: { sellerId: string; prompt: string; productType: string; modelId?: string | null }) {
  const prompt = input.prompt.trim().slice(0, 600);
  if (prompt.length < 3) throw new Error("Describe the design in a few words.");
  const model = getImageModel(input.modelId);
  const images = await model.generate({ prompt, productType: input.productType, count: 4 });
  const batch = randomBytes(6).toString("hex");
  const stored = await Promise.all(
    images.map(async (img, i) => {
      const { url } = await putObject(`designs/${input.sellerId}/${batch}-${i}.${img.ext}`, img.data, img.contentType, "public");
      return { url: url!, seed: img.seed };
    }),
  );
  const generation = await db.generation.create({
    data: { sellerId: input.sellerId, model: model.label, prompt, productType: input.productType, images: stored },
  });
  return { generationId: generation.id, model: model.label, images: stored };
}

/** Partner-rendered photos if the partner has a mockup API and a live connection; otherwise null. */
export async function partnerMockups(input: {
  sellerId: string;
  providerId: string;
  partnerProductId: string;
  variantIds: string[];
  designUrl: string;
}): Promise<string[] | null> {
  const provider = getProvider(input.providerId);
  if (!provider.createMockups) return null;
  const connection = await db.partnerConnection.findUnique({
    where: { sellerId_provider: { sellerId: input.sellerId, provider: provider.id } },
  });
  if (!connection || connection.mock) return null;
  const catalog = await provider.listCatalog(contextFor(connection));
  const product = catalog.find((p) => p.id === input.partnerProductId);
  try {
    return await provider.createMockups(contextFor(connection), {
      partnerProductId: input.partnerProductId,
      partnerVariantIds: input.variantIds.length ? input.variantIds : product?.variants.slice(0, 1).map((v) => v.id) ?? [],
      designUrl: absoluteUrl(input.designUrl),
      partnerData: product?.data ?? null,
    });
  } catch {
    return null;
  }
}

export async function draftCopy(input: { prompt: string; productTypeId: string; aiTool: string; providerId: string }): Promise<ListingCopy & { writer: string }> {
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
  try {
    return { ...(await writer.write(args)), writer: writer.label };
  } catch {
    return { ...(await mockCopywriter.write(args)), writer: mockCopywriter.label };
  }
}
