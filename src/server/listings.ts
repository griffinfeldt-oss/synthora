import "server-only";
import { z } from "zod";
import type { Asset, Listing, Prisma, Seller } from "@prisma/client";
import { FEES } from "@/config/fees";
import { LAUNCH, providerEnabled } from "@/config/launch";
import { DEFAULT_LICENSE_KEY, latestLicense } from "@/config/licenses";
import { PRODUCT_TYPES, productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { isLive } from "@/lib/env";
import { publicUrl } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { contextFor, getProvider } from "@/fulfillment/registry";
import { AssetError, ownedAssets, previewFor } from "./assets";
import { runListingChecks, type Manifest } from "./listing-checks";
import { audit, notifySeller } from "./notify";
import { onboardingState } from "./sellers";

/** Listings a buyer may see and buy: approved, active, from an approved shop. */
export function publicListingWhere(): Prisma.ListingWhereInput {
  return {
    status: "ACTIVE",
    approvedVersionId: { not: null },
    seller: { status: "APPROVED", ...(isLive() ? { isTest: false } : {}) },
    // Live checkout never sends real orders to a demo partner connection.
    ...(isLive() ? { OR: [{ partnerConnectionId: null }, { partnerConnection: { mock: false } }] } : {}),
  };
}

const alt = z.string().max(200).default("");
const imageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PHOTO"), assetId: z.string().min(1), alt }),
  z.object({ kind: z.literal("MOCKUP_RENDER"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), alt }),
  z.object({ kind: z.literal("MOCKUP_PARTNER"), url: z.string().url().max(1000), alt }),
  z.object({ kind: z.literal("DESIGN"), alt }),
  // Preview of a digital image file, for digital listings without photos.
  z.object({ kind: z.literal("FILE_PREVIEW"), alt }),
]);

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
    /** Private print file / AI original, by Asset id. */
    designAssetId: z.string().nullable().optional(),
    /** Private file buyers download, by Asset id. */
    deliverableAssetId: z.string().nullable().optional(),
    licenseKey: z.enum(["personal", "small-business"]).default(DEFAULT_LICENSE_KEY),
    tags: z.array(z.string().trim().toLowerCase().max(30)).max(10).default([]),
    images: z.array(imageSchema).min(1, "Add at least one image").max(10),
    rightsConfirmed: z.literal(true, { message: "Confirm you have the rights to sell this item" }),
    /** true: submit for review now. false: save a draft. */
    publish: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "DIGITAL" && !v.deliverableAssetId) ctx.addIssue({ code: "custom", path: ["deliverableAssetId"], message: "Add the file buyers will download" });
    if (v.kind === "SELF_SHIP" && (v.shippingCents === null || v.shippingCents === undefined))
      ctx.addIssue({ code: "custom", path: ["shippingCents"], message: "Set a shipping price (0 for free shipping)" });
    if (v.kind === "PARTNER" && !v.partnerProductId) ctx.addIssue({ code: "custom", path: ["partnerProductId"], message: "Choose a partner product" });
    if (v.kind === "PARTNER" && !v.designAssetId) ctx.addIssue({ code: "custom", path: ["designAssetId"], message: "Add the artwork to print" });
    if (v.images.some((i) => i.kind === "MOCKUP_RENDER" || i.kind === "DESIGN") && !v.designAssetId)
      ctx.addIssue({ code: "custom", path: ["images"], message: "Mockups need a design file" });
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

/** Partner-hosted mockup photos are the only images not stored by us. */
const PARTNER_IMAGE_HOSTS: Record<string, RegExp> = {
  printful: /^https:\/\/files\.cdn\.printful\.com\//,
  printify: /^https:\/\/images-api\.printify\.com\//,
  gelato: /^https:\/\/[a-z0-9-]+\.gelatoapis\.com\//,
};

async function resolveFiles(seller: Seller, input: Pick<ListingInput, "designAssetId" | "deliverableAssetId" | "generationId" | "images" | "provider">, shape: string) {
  const photoIds = input.images.filter((i) => i.kind === "PHOTO").map((i) => (i as { assetId: string }).assetId);
  let assets: Map<string, Asset>;
  try {
    assets = await ownedAssets(seller.id, [input.designAssetId, input.deliverableAssetId, ...photoIds]);
  } catch (e) {
    if (e instanceof AssetError) throw new ListingError(e.message);
    throw e;
  }
  const design = input.designAssetId ? assets.get(input.designAssetId)! : null;
  const deliverable = input.deliverableAssetId ? assets.get(input.deliverableAssetId)! : null;
  if (design && (design.visibility !== "private" || !["GENERATED_DESIGN", "UPLOAD_FILE"].includes(design.kind) || !/^image\//.test(design.contentType))) {
    throw new ListingError("The design must be an image uploaded as artwork or made in the studio.");
  }
  if (deliverable && (deliverable.visibility !== "private" || !["GENERATED_DESIGN", "UPLOAD_FILE"].includes(deliverable.kind))) {
    throw new ListingError("The download must be a file uploaded for buyers.");
  }
  for (const id of photoIds) {
    const a = assets.get(id)!;
    if (a.kind !== "UPLOAD_IMAGE" || a.visibility !== "public") throw new ListingError("Photos must be uploaded as photos.");
  }
  // The generation link is taken from the server's records, never from the browser.
  let generationId: string | null = null;
  if (input.generationId || design?.generationId) {
    const gen = design?.generationId ? await db.generation.findUnique({ where: { id: design.generationId } }) : null;
    if (input.generationId && (!gen || gen.id !== input.generationId)) throw new ListingError("That design did not come from that generation.");
    if (gen && gen.sellerId !== seller.id) throw new ListingError("That design does not belong to your account.");
    generationId = gen?.id ?? null;
  }
  const preview = design ? await previewFor(design.id) : null;
  if (design && !preview) throw new ListingError("The design's preview is missing. Upload it again.");
  const filePreview = deliverable ? await previewFor(deliverable.id) : null;

  const hostRule = PARTNER_IMAGE_HOSTS[input.provider];
  const images = input.images.map((img, i) => {
    switch (img.kind) {
      case "PHOTO": {
        const a = assets.get(img.assetId)!;
        return { url: publicUrl(a.storageKey), assetId: a.id, kind: "PHOTO" as const, alt: img.alt, mockup: undefined, position: i };
      }
      case "MOCKUP_RENDER": {
        const url = publicUrl(preview!.storageKey);
        return { url, assetId: preview!.id, kind: "MOCKUP_RENDER" as const, alt: img.alt, mockup: { shape, color: img.color, designUrl: url }, position: i };
      }
      case "DESIGN":
        return { url: publicUrl(preview!.storageKey), assetId: preview!.id, kind: "DESIGN" as const, alt: img.alt, mockup: undefined, position: i };
      case "MOCKUP_PARTNER":
        if (!hostRule?.test(img.url)) throw new ListingError("Partner photos must come from your partner's mockup service.");
        return { url: img.url, assetId: null, kind: "MOCKUP_PARTNER" as const, alt: img.alt, mockup: undefined, position: i };
      case "FILE_PREVIEW":
        if (!filePreview) throw new ListingError("That file has no preview image. Add a photo instead.");
        return { url: publicUrl(filePreview.storageKey), assetId: filePreview.id, kind: "DESIGN" as const, alt: img.alt, mockup: undefined, position: i };
    }
  });
  return { design, deliverable, generationId, images };
}

export async function createListing(seller: Seller, input: ListingInput): Promise<{ id: string; slug: string; status: string; missing: string[]; problems: string[] }> {
  const provider = getProvider(input.provider);
  if (!providerEnabled(provider.id)) throw new ListingError(`${provider.name} is not available on Synthora right now.`);
  const kindForProvider = provider.kind === "pod" ? "PARTNER" : provider.kind === "self" ? "SELF_SHIP" : "DIGITAL";
  if (kindForProvider !== input.kind) throw new ListingError("That fulfillment option does not match the listing type.");
  if (!provider.productTypes.includes(input.productType)) throw new ListingError(`${provider.name} does not make that product.`);
  const def = productType(input.productType);

  let connectionId: string | null = null;
  let variants: Array<{ name: string; partnerVariantId: string | null; baseCostCents: number }> = [{ name: "Standard", partnerVariantId: null, baseCostCents: input.baseCostCents }];
  let baseCostCents = input.baseCostCents;
  let partnerData: Record<string, unknown> = {};

  if (provider.kind === "pod") {
    const connection = await db.partnerConnection.findUnique({
      where: { sellerId_provider: { sellerId: seller.id, provider: provider.id } },
    });
    if (!connection || connection.status !== "ACTIVE") throw new ListingError(`Connect your ${provider.name} account first.`);
    if (connection.mock && isLive()) throw new ListingError(`Reconnect ${provider.name} with your real account. Demo connections cannot sell.`);
    connectionId = connection.id;
    const catalog = await provider.listCatalog(contextFor(connection));
    const product = catalog.find((p) => p.id === input.partnerProductId);
    if (!product) throw new ListingError("That partner product is not available.");
    const chosen = input.partnerVariantIds.length ? product.variants.filter((v) => input.partnerVariantIds.includes(v.id)) : product.variants;
    if (!chosen.length) throw new ListingError("Choose at least one size or option.");
    variants = chosen.map((v) => ({ name: v.name, partnerVariantId: v.id, baseCostCents: v.baseCostCents }));
    baseCostCents = Math.max(...chosen.map((v) => v.baseCostCents));
    if (input.priceCents <= baseCostCents) throw new ListingError("Price must be higher than the partner's base cost.");
    partnerData = product.data ?? {};
  }

  const files = await resolveFiles(seller, input, def.shape);
  const license = input.kind === "DIGITAL" ? await ensureLicense(input.licenseKey) : null;
  const slug = await uniqueSlug(input.title);

  const listing = await db.listing.create({
    data: {
      sellerId: seller.id,
      slug,
      title: input.title,
      description: input.description,
      priceCents: input.priceCents,
      status: "DRAFT",
      kind: input.kind,
      productType: def.id,
      category: def.category,
      tags: input.tags,
      aiTool: input.aiTool,
      aiInvolvement: input.aiInvolvement,
      howMade: input.howMade,
      prompt: input.prompt ?? null,
      generationId: files.generationId,
      provider: provider.id,
      partnerConnectionId: connectionId,
      partnerProductId: input.partnerProductId ?? null,
      partnerData: partnerData as Prisma.InputJsonValue,
      baseCostCents,
      shippingCents: input.kind === "SELF_SHIP" ? input.shippingCents ?? 0 : null,
      processingDays: input.processingDays,
      inventory: input.kind === "SELF_SHIP" ? input.inventory ?? null : null,
      rightsConfirmedAt: new Date(),
      designAssetId: files.design?.id ?? null,
      deliverableAssetId: files.deliverable?.id ?? null,
      licenseVersionId: license?.id ?? null,
      images: {
        create: files.images.map((img) => ({
          url: img.url,
          assetId: img.assetId,
          alt: img.alt || `${input.title}, ${def.label.toLowerCase()}`,
          kind: img.kind,
          mockup: img.mockup ?? undefined,
          position: img.position,
        })),
      },
      variants: { create: variants.map((v, i) => ({ ...v, position: i })) },
    },
  });
  await audit(seller.userId, "listing.created", "Listing", listing.id);
  if (!input.publish) {
    const state = await onboardingState(seller);
    return { id: listing.id, slug, status: "DRAFT", missing: state.missing, problems: [] };
  }
  const res = await submitForReview(seller.id, listing.id);
  return { id: listing.id, slug, ...res };
}

export async function ensureLicense(key: string) {
  const def = latestLicense(key);
  return db.licenseVersion.upsert({ where: { id: def.id }, create: def, update: {} });
}

// ─── Versions and review ─────────────────────────────────────────────────────

export interface VersionSnapshot {
  title: string;
  description: string;
  howMade: string;
  aiTool: string;
  aiInvolvement: "FULL" | "ASSISTED";
  prompt: string | null;
  tags: string[];
  priceCents: number;
  kind: string;
  productType: string;
  provider: string;
  partnerProductId: string | null;
  designAssetId: string | null;
  deliverableAssetId: string | null;
  licenseVersionId: string | null;
  images: Array<{ kind: string; url: string; alt: string }>;
  variants: string[];
}

type FullListing = Listing & {
  images: Array<{ kind: string; url: string; alt: string }>;
  variants: Array<{ name: string }>;
};

function snapshotOf(listing: FullListing, overrides: Partial<VersionSnapshot> = {}): VersionSnapshot {
  return {
    title: listing.title,
    description: listing.description,
    howMade: listing.howMade,
    aiTool: listing.aiTool,
    aiInvolvement: listing.aiInvolvement,
    prompt: listing.prompt,
    tags: listing.tags,
    priceCents: listing.priceCents,
    kind: listing.kind,
    productType: listing.productType,
    provider: listing.provider,
    partnerProductId: listing.partnerProductId,
    designAssetId: listing.designAssetId,
    deliverableAssetId: listing.deliverableAssetId,
    licenseVersionId: listing.licenseVersionId,
    images: listing.images.map((i) => ({ kind: i.kind, url: i.url, alt: i.alt })),
    variants: listing.variants.map((v) => v.name),
    ...overrides,
  };
}

async function checkSnapshot(listing: FullListing, snap: VersionSnapshot): Promise<Manifest> {
  const [design, deliverable, license] = await Promise.all([
    snap.designAssetId ? db.asset.findUnique({ where: { id: snap.designAssetId } }) : null,
    snap.deliverableAssetId ? db.asset.findUnique({ where: { id: snap.deliverableAssetId } }) : null,
    snap.licenseVersionId ? db.licenseVersion.findUnique({ where: { id: snap.licenseVersionId } }) : null,
  ]);
  return runListingChecks({
    kind: listing.kind,
    productTypeId: listing.productType,
    title: snap.title,
    description: snap.description,
    aiTool: snap.aiTool,
    howMade: snap.howMade,
    designAsset: design,
    deliverableAsset: deliverable,
    license,
    variantNames: snap.variants,
    images: snap.images,
    generationRecorded: Boolean(listing.generationId && design?.generationId === listing.generationId),
  });
}

async function loadFull(listingId: string) {
  return db.listing.findUnique({
    where: { id: listingId },
    include: { images: { orderBy: { position: "asc" } }, variants: { orderBy: { position: "asc" } }, seller: true },
  });
}

/**
 * Run the technical checks and, if they pass, create a version for a person to
 * review. A listing that is already on sale keeps selling its approved version.
 */
export async function submitForReview(
  sellerId: string,
  listingId: string,
  overrides: Partial<VersionSnapshot> = {},
): Promise<{ status: string; missing: string[]; problems: string[] }> {
  const listing = await loadFull(listingId);
  if (!listing || listing.sellerId !== sellerId) throw new ListingError("Listing not found");
  if (listing.status === "SUSPENDED" || listing.status === "REMOVED") throw new ListingError("This listing was taken down by Synthora and cannot be resubmitted here.");
  const state = await onboardingState(listing.seller);
  if (!state.canPublish) {
    await db.listing.update({ where: { id: listing.id }, data: { statusReason: `Finish setup: ${state.missing.join(", ")}` } });
    return { status: listing.status, missing: state.missing, problems: [] };
  }
  const snap = snapshotOf(listing, overrides);
  const manifest = await checkSnapshot(listing, snap);
  if (!manifest.passed) {
    if (!listing.approvedVersionId) {
      await db.listing.update({ where: { id: listing.id }, data: { status: "DRAFT", statusReason: manifest.problems.join(" ") } });
    }
    return { status: listing.approvedVersionId ? listing.status : "DRAFT", missing: [], problems: manifest.problems };
  }

  const version = await db.$transaction(async (tx) => {
    await tx.listingVersion.updateMany({ where: { listingId, status: "PENDING_REVIEW" }, data: { status: "SUPERSEDED" } });
    const last = await tx.listingVersion.aggregate({ where: { listingId }, _max: { number: true } });
    const design = snap.designAssetId ? await tx.asset.findUnique({ where: { id: snap.designAssetId } }) : null;
    return tx.listingVersion.create({
      data: {
        listingId,
        number: (last._max.number ?? 0) + 1,
        status: "PENDING_REVIEW",
        snapshot: snap as unknown as Prisma.InputJsonValue,
        designAssetId: snap.designAssetId,
        designSha256: design?.sha256 ?? null,
        deliverableAssetId: snap.deliverableAssetId,
        licenseVersionId: snap.licenseVersionId,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        checksPassed: true,
      },
    });
  });

  if (!LAUNCH.moderation.requireReview) {
    await approveVersion(null, version.id, "Automatic: listing review is switched off", null);
    return { status: "ACTIVE", missing: [], problems: [] };
  }
  if (!listing.approvedVersionId) {
    await db.listing.update({ where: { id: listing.id }, data: { status: "PENDING_REVIEW", statusReason: null } });
  }
  return { status: listing.approvedVersionId ? listing.status : "PENDING_REVIEW", missing: [], problems: [] };
}

/** A reviewer approves a version: it becomes what buyers see and buy. */
export async function approveVersion(reviewerId: string | null, versionId: string, scope: string, note: string | null): Promise<void> {
  const version = await db.listingVersion.findUnique({ where: { id: versionId }, include: { listing: true } });
  if (!version || version.status !== "PENDING_REVIEW") throw new ListingError("That version is not waiting for review.");
  const snap = version.snapshot as unknown as VersionSnapshot;
  const listing = version.listing;
  await db.$transaction(async (tx) => {
    if (listing.approvedVersionId) await tx.listingVersion.update({ where: { id: listing.approvedVersionId }, data: { status: "SUPERSEDED" } });
    await tx.listingVersion.update({ where: { id: version.id }, data: { status: "APPROVED" } });
    const sellable = ["DRAFT", "PENDING_REVIEW", "REJECTED", "ACTIVE"].includes(listing.status);
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        title: snap.title,
        description: snap.description,
        howMade: snap.howMade,
        aiTool: snap.aiTool,
        aiInvolvement: snap.aiInvolvement,
        prompt: snap.prompt,
        tags: snap.tags,
        designAssetId: snap.designAssetId,
        deliverableAssetId: snap.deliverableAssetId,
        licenseVersionId: snap.licenseVersionId,
        approvedVersionId: version.id,
        status: sellable ? "ACTIVE" : listing.status,
        statusReason: sellable ? null : listing.statusReason,
        publishedAt: listing.publishedAt ?? new Date(),
      },
    });
    if (reviewerId) {
      await tx.reviewDecision.create({ data: { listingId: listing.id, versionId: version.id, reviewerId, outcome: "APPROVED", scope, note } });
    }
  });
  await audit(reviewerId, "listing.approved", "Listing", listing.id, { versionId, scope });
  await notifySeller(listing.sellerId, {
    type: "listing_approved",
    title: `"${snap.title}" is approved`,
    body: listing.approvedVersionId ? "Your changes are live." : "Your listing is now in the shop.",
    href: `/seller/listings/${listing.id}`,
  });
}

export async function requestChanges(reviewerId: string, versionId: string, scope: string, note: string): Promise<void> {
  const version = await db.listingVersion.findUnique({ where: { id: versionId }, include: { listing: true } });
  if (!version || version.status !== "PENDING_REVIEW") throw new ListingError("That version is not waiting for review.");
  if (note.trim().length < 5) throw new ListingError("Tell the seller what to change.");
  await db.$transaction(async (tx) => {
    await tx.listingVersion.update({ where: { id: version.id }, data: { status: "REJECTED" } });
    if (!version.listing.approvedVersionId) {
      await tx.listing.update({ where: { id: version.listingId }, data: { status: "REJECTED", statusReason: note } });
    }
    await tx.reviewDecision.create({ data: { listingId: version.listingId, versionId, reviewerId, outcome: "CHANGES_REQUESTED", scope, note } });
  });
  await audit(reviewerId, "listing.changes_requested", "Listing", version.listingId, { versionId, note });
  await notifySeller(version.listing.sellerId, {
    type: "listing_changes",
    title: `Changes needed: "${version.listing.title}"`,
    body: `${note}${version.listing.approvedVersionId ? " Your listing stays on sale as it was." : ""}`,
    href: `/seller/listings/${version.listingId}`,
  });
}

// ─── Seller changes ──────────────────────────────────────────────────────────

export async function setListingStatusBySeller(sellerId: string, listingId: string, action: "pause" | "activate" | "delete") {
  const listing = await db.listing.findFirst({ where: { id: listingId, sellerId }, include: { seller: true } });
  if (!listing) throw new ListingError("Listing not found");
  if (listing.status === "SUSPENDED" || listing.status === "REMOVED") throw new ListingError("This listing was taken down by Synthora and cannot be changed here.");
  if (action === "pause") {
    await db.listing.update({ where: { id: listingId }, data: { status: "PAUSED", statusReason: "Paused by seller" } });
  } else if (action === "activate") {
    if (listing.status === "PAUSED_BILLING") throw new ListingError("Renew your plan to reactivate this listing.");
    if (!listing.approvedVersionId) throw new ListingError("Submit this listing for review first.");
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

/**
 * Edit a listing. Price, stock and shipping change at once. Anything buyers rely
 * on (words, disclosure, files) on a listing that is on sale becomes a new version
 * for review; until it is approved the approved version keeps selling.
 */
export async function updateListingBasics(
  sellerId: string,
  listingId: string,
  input: { title: string; description: string; priceCents: number; howMade: string; aiTool: string; tags: string[]; inventory?: number | null; shippingCents?: number | null; deliverableAssetId?: string | null },
): Promise<{ review: "none" | "pending" | "problems"; problems: string[] }> {
  const listing = await loadFull(listingId);
  if (!listing || listing.sellerId !== sellerId) throw new ListingError("Listing not found");
  if (input.priceCents < FEES.listing.minPriceCents) throw new ListingError("Price is too low");
  if (listing.kind === "PARTNER" && input.priceCents <= listing.baseCostCents) throw new ListingError("Price must be higher than the partner's base cost.");
  if (input.howMade.trim().length < 20) throw new ListingError("Tell buyers how it was made (at least a sentence).");

  let deliverableAssetId = listing.deliverableAssetId;
  if (input.deliverableAssetId && input.deliverableAssetId !== listing.deliverableAssetId) {
    if (listing.kind !== "DIGITAL") throw new ListingError("Only digital listings have a download file.");
    const a = (await ownedAssets(sellerId, [input.deliverableAssetId]).catch((e) => {
      throw new ListingError(e instanceof Error ? e.message : "File not found");
    })).get(input.deliverableAssetId)!;
    if (a.visibility !== "private" || a.kind !== "UPLOAD_FILE") throw new ListingError("Upload the new file as a download file.");
    deliverableAssetId = a.id;
  }

  // Operational fields apply immediately.
  await db.listing.update({
    where: { id: listingId },
    data: {
      priceCents: input.priceCents,
      inventory: listing.kind === "SELF_SHIP" ? input.inventory ?? null : undefined,
      shippingCents: listing.kind === "SELF_SHIP" ? input.shippingCents ?? 0 : undefined,
    },
  });

  const content = {
    title: input.title.trim().slice(0, 80),
    description: input.description.trim(),
    howMade: input.howMade.trim(),
    aiTool: input.aiTool.trim(),
    tags: input.tags,
    deliverableAssetId,
  };
  const changed =
    content.title !== listing.title ||
    content.description !== listing.description ||
    content.howMade !== listing.howMade ||
    content.aiTool !== listing.aiTool ||
    content.tags.join(",") !== listing.tags.join(",") ||
    content.deliverableAssetId !== listing.deliverableAssetId;
  if (!changed) return { review: "none", problems: [] };

  if (!listing.approvedVersionId) {
    // Not on sale yet: edit in place, and resubmit if it was waiting for review.
    await db.listing.update({ where: { id: listingId }, data: content });
    if (listing.status === "PENDING_REVIEW" || listing.status === "REJECTED") {
      const res = await submitForReview(sellerId, listingId);
      return { review: res.problems.length ? "problems" : "pending", problems: res.problems };
    }
    return { review: "none", problems: [] };
  }
  if (!LAUNCH.moderation.requireReview) {
    await db.listing.update({ where: { id: listingId }, data: content });
    return { review: "none", problems: [] };
  }
  const res = await submitForReview(sellerId, listingId, content);
  return { review: res.problems.length ? "problems" : "pending", problems: res.problems };
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
  // Kinds switched off for this launch are hidden.
  const kinds = (Object.keys(LAUNCH.listingKinds) as Array<keyof typeof LAUNCH.listingKinds>).filter((k) => LAUNCH.listingKinds[k]);
  and.push({ kind: { in: kinds } });
  where.AND = and;

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
