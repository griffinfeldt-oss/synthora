import "server-only";
import { z } from "zod";
import type { Prisma, Seller } from "@prisma/client";
import { FEES } from "@/config/fees";
import { PRODUCT_TYPES, productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { contextFor, getProvider } from "@/fulfillment/registry";
import { onboardingState } from "./sellers";

/** Listings a buyer may see and buy. */
export function publicListingWhere(): Prisma.ListingWhereInput {
  return { status: "ACTIVE", seller: { status: "APPROVED" } };
}

const imageSchema = z.object({
  url: z.string().min(1),
  alt: z.string().max(200).default(""),
  kind: z.enum(["PHOTO", "DESIGN", "MOCKUP_PARTNER", "MOCKUP_RENDER"]),
  mockup: z.object({ shape: z.string(), color: z.string(), designUrl: z.string() }).nullable().optional(),
});

export const listingInputSchema = z
  .object({
    title: z.string().trim().min(3, "Give it a title").max(80, "Keep the title under 80 characters"),
    description: z.string().trim().min(10, "Add a short description").max(3000),
    priceCents: z
      .number()
      .int()
      .min(FEES.listing.minPriceCents, `Minimum price is $${FEES.listing.minPriceCents / 100}`)
      .max(FEES.listing.maxPriceCents),
    productType: z.string().refine((v) => PRODUCT_TYPES.some((p) => p.id === v), "Choose a product type"),
    kind: z.enum(["PARTNER", "SELF_SHIP", "DIGITAL"]),
    provider: z.string().min(1),
    partnerProductId: z.string().nullable().optional(),
    partnerVariantIds: z.array(z.string()).default([]),
    baseCostCents: z.number().int().min(0).default(0),
    shippingCents: z.number().int().min(0).max(100_000).nullable().optional(),
    processingDays: z.number().int().min(0).max(60).default(3),
    inventory: z.number().int().min(0).max(100_000).nullable().optional(),
    aiTool: z.string().trim().min(2, "Name the AI tool you used").max(80),
    aiInvolvement: z.enum(["FULL", "ASSISTED"]),
    howMade: z.string().trim().min(20, "Tell buyers how it was made (at least a sentence)").max(2000),
    prompt: z.string().max(2000).nullable().optional(),
    generationId: z.string().nullable().optional(),
    designUrl: z.string().nullable().optional(),
    tags: z.array(z.string().trim().toLowerCase().max(30)).max(10).default([]),
    images: z.array(imageSchema).min(1, "Add at least one image").max(10),
    digitalAsset: z
      .object({
        storageKey: z.string().min(1),
        fileName: z.string().min(1),
        contentType: z.string().min(1),
        sizeBytes: z.number().int().positive(),
      })
      .nullable()
      .optional(),
    rightsConfirmed: z.literal(true, { message: "Confirm you have the rights to sell this item" }),
    publish: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "DIGITAL" && !v.digitalAsset) ctx.addIssue({ code: "custom", path: ["digitalAsset"], message: "Upload the file buyers will download" });
    if (v.kind === "SELF_SHIP" && (v.shippingCents === null || v.shippingCents === undefined))
      ctx.addIssue({ code: "custom", path: ["shippingCents"], message: "Set a shipping price (0 for free shipping)" });
    if (v.kind === "PARTNER" && !v.partnerProductId) ctx.addIssue({ code: "custom", path: ["partnerProductId"], message: "Choose a partner product" });
  });

export type ListingInput = z.infer<typeof listingInputSchema>;

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "listing";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await db.listing.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export class ListingError extends Error {}

export async function createListing(seller: Seller, input: ListingInput): Promise<{ id: string; slug: string; status: string; missing: string[] }> {
  const provider = getProvider(input.provider);
  const kindForProvider = provider.kind === "pod" ? "PARTNER" : provider.kind === "self" ? "SELF_SHIP" : "DIGITAL";
  if (kindForProvider !== input.kind) throw new ListingError("That fulfillment option does not match the listing type.");
  if (!provider.productTypes.includes(input.productType)) throw new ListingError(`${provider.name} does not make that product.`);

  let connectionId: string | null = null;
  let variants: Array<{ name: string; partnerVariantId: string | null; baseCostCents: number }> = [{ name: "Standard", partnerVariantId: null, baseCostCents: input.baseCostCents }];
  let baseCostCents = input.baseCostCents;

  if (provider.kind === "pod") {
    const connection = await db.partnerConnection.findUnique({
      where: { sellerId_provider: { sellerId: seller.id, provider: provider.id } },
    });
    if (!connection || connection.status !== "ACTIVE") throw new ListingError(`Connect your ${provider.name} account first.`);
    connectionId = connection.id;
    const catalog = await provider.listCatalog(contextFor(connection));
    const product = catalog.find((p) => p.id === input.partnerProductId);
    if (!product) throw new ListingError("That partner product is not available.");
    const chosen = input.partnerVariantIds.length
      ? product.variants.filter((v) => input.partnerVariantIds.includes(v.id))
      : product.variants;
    if (!chosen.length) throw new ListingError("Choose at least one size or option.");
    variants = chosen.map((v) => ({ name: v.name, partnerVariantId: v.id, baseCostCents: v.baseCostCents }));
    baseCostCents = Math.max(...chosen.map((v) => v.baseCostCents));
    if (input.priceCents <= baseCostCents) throw new ListingError("Price must be higher than the partner's base cost.");
  }

  const state = await onboardingState(seller);
  const status = input.publish ? (state.canPublish ? "ACTIVE" : "DRAFT") : "DRAFT";
  const slug = await uniqueSlug(input.title);
  const def = productType(input.productType);

  const listing = await db.listing.create({
    data: {
      sellerId: seller.id,
      slug,
      title: input.title,
      description: input.description,
      priceCents: input.priceCents,
      status,
      kind: input.kind,
      productType: def.id,
      category: def.category,
      tags: input.tags,
      aiTool: input.aiTool,
      aiInvolvement: input.aiInvolvement,
      howMade: input.howMade,
      prompt: input.prompt ?? null,
      generationId: input.generationId ?? null,
      provider: provider.id,
      partnerConnectionId: connectionId,
      partnerProductId: input.partnerProductId ?? null,
      partnerData: {
        ...((provider.kind === "pod"
          ? (await provider.listCatalog(contextFor(null))).find((p) => p.id === input.partnerProductId)?.data
          : undefined) ?? {}),
        designUrl: input.designUrl ?? undefined,
      } as Prisma.InputJsonValue,
      baseCostCents,
      shippingCents: input.kind === "SELF_SHIP" ? input.shippingCents ?? 0 : null,
      processingDays: input.processingDays,
      inventory: input.kind === "SELF_SHIP" ? input.inventory ?? null : null,
      rightsConfirmedAt: new Date(),
      publishedAt: status === "ACTIVE" ? new Date() : null,
      images: {
        create: input.images.map((img, i) => ({
          url: img.url,
          alt: img.alt || `${input.title}, ${def.label.toLowerCase()}`,
          kind: img.kind,
          mockup: img.mockup ?? undefined,
          position: i,
        })),
      },
      variants: { create: variants.map((v, i) => ({ ...v, position: i })) },
      digitalAsset: input.digitalAsset ? { create: input.digitalAsset } : undefined,
    },
  });
  return { id: listing.id, slug: listing.slug, status, missing: state.missing };
}

export async function setListingStatusBySeller(sellerId: string, listingId: string, action: "pause" | "activate" | "delete") {
  const listing = await db.listing.findFirst({ where: { id: listingId, sellerId }, include: { seller: true } });
  if (!listing) throw new ListingError("Listing not found");
  if (listing.status === "SUSPENDED" || listing.status === "REMOVED") throw new ListingError("This listing was taken down by Latent.Market and cannot be changed here.");
  if (action === "pause") {
    await db.listing.update({ where: { id: listingId }, data: { status: "PAUSED", statusReason: "Paused by seller" } });
  } else if (action === "activate") {
    if (listing.status === "PAUSED_BILLING") throw new ListingError("Renew your plan to reactivate this listing.");
    const state = await onboardingState(listing.seller);
    if (!state.canPublish) throw new ListingError(`Finish setup first: ${state.missing.join(", ")}.`);
    await db.listing.update({ where: { id: listingId }, data: { status: "ACTIVE", statusReason: null, publishedAt: listing.publishedAt ?? new Date() } });
  } else {
    const sold = await db.orderItem.count({ where: { listingId } });
    if (sold > 0) {
      await db.listing.update({ where: { id: listingId }, data: { status: "REMOVED", statusReason: "Deleted by seller" } });
    } else {
      await db.listing.delete({ where: { id: listingId } });
    }
  }
}

export async function updateListingBasics(
  sellerId: string,
  listingId: string,
  input: { title: string; description: string; priceCents: number; howMade: string; aiTool: string; tags: string[]; inventory?: number | null; shippingCents?: number | null },
) {
  const listing = await db.listing.findFirst({ where: { id: listingId, sellerId } });
  if (!listing) throw new ListingError("Listing not found");
  if (input.priceCents < FEES.listing.minPriceCents) throw new ListingError("Price is too low");
  if (listing.kind === "PARTNER" && input.priceCents <= listing.baseCostCents) throw new ListingError("Price must be higher than the partner's base cost.");
  if (input.howMade.trim().length < 20) throw new ListingError("Tell buyers how it was made (at least a sentence).");
  await db.listing.update({
    where: { id: listingId },
    data: {
      title: input.title.trim().slice(0, 80),
      description: input.description.trim(),
      priceCents: input.priceCents,
      howMade: input.howMade.trim(),
      aiTool: input.aiTool.trim(),
      tags: input.tags,
      inventory: listing.kind === "SELF_SHIP" ? input.inventory ?? null : undefined,
      shippingCents: listing.kind === "SELF_SHIP" ? input.shippingCents ?? 0 : undefined,
    },
  });
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchParams {
  q?: string;
  category?: string;
  type?: string;
  tool?: string;
  fulfillment?: string;
  min?: number;
  max?: number;
  sort?: "new" | "price_asc" | "price_desc" | "popular";
  page?: number;
  sellerId?: string;
}

export const PAGE_SIZE = 12;

export async function searchListings(p: SearchParams) {
  const where: Prisma.ListingWhereInput = { ...publicListingWhere() };
  const and: Prisma.ListingWhereInput[] = [];
  if (p.q) {
    const q = p.q.trim().slice(0, 100);
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { aiTool: { contains: q, mode: "insensitive" } },
        { tags: { has: q.toLowerCase() } },
        { seller: { shopName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (p.category) and.push({ category: p.category });
  if (p.type) and.push({ productType: p.type });
  if (p.tool) and.push({ aiTool: { equals: p.tool, mode: "insensitive" } });
  if (p.fulfillment === "digital") and.push({ kind: "DIGITAL" });
  if (p.fulfillment === "physical") and.push({ kind: { not: "DIGITAL" } });
  if (p.min !== undefined) and.push({ priceCents: { gte: p.min } });
  if (p.max !== undefined) and.push({ priceCents: { lte: p.max } });
  if (p.sellerId) and.push({ sellerId: p.sellerId });
  if (and.length) where.AND = and;

  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    p.sort === "price_asc"
      ? [{ priceCents: "asc" }]
      : p.sort === "price_desc"
        ? [{ priceCents: "desc" }]
        : p.sort === "popular"
          ? [{ salesCount: "desc" }, { ratingAvg: "desc" }]
          : [{ publishedAt: "desc" }, { createdAt: "desc" }];

  const page = Math.max(1, p.page ?? 1);
  const [total, items] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { images: { orderBy: { position: "asc" }, take: 2 }, seller: { select: { shopName: true, slug: true } } },
    }),
  ]);
  return { total, items, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function facetCounts() {
  const where = publicListingWhere();
  const [tools, types] = await Promise.all([
    db.listing.groupBy({ by: ["aiTool"], where, _count: { _all: true }, orderBy: { _count: { aiTool: "desc" } } }),
    db.listing.groupBy({ by: ["productType"], where, _count: { _all: true } }),
  ]);
  return {
    tools: tools.map((t) => ({ value: t.aiTool, count: t._count._all })),
    types: types.map((t) => ({ value: t.productType, count: t._count._all })),
  };
}
