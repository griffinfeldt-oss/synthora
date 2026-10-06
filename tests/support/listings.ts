import { db } from "@/lib/db";
import { renderArt } from "@/ai/art";
import { getProvider, contextFor } from "@/fulfillment/registry";
import { storeOriginal } from "@/server/assets";
import { approveVersion, createListing } from "@/server/listings";

export async function reviewer() {
  return (
    (await db.user.findFirst({ where: { email: "reviewer@test.local" } })) ??
    db.user.create({ data: { email: "reviewer@test.local", name: "Rev", role: "ADMIN", emailVerified: new Date() } })
  );
}

/** A private design original (SVG, so it is print-ready at any size). */
export async function designAsset(sellerId: string, seed = 1) {
  const { svg } = renderArt({ prompt: "test fox", productType: "poster", seed });
  return (await storeOriginal({ sellerId, kind: "UPLOAD_FILE", bytes: Buffer.from(svg), contentType: "image/svg+xml", ext: "svg", fileName: "design.svg" })).original;
}

/** Create, check and approve a listing through the real code path. */
export async function approvedListing(
  sellerId: string,
  provider: "printify" | "printful" | "gelato" | "digital" | "self",
  priceCents: number,
  productTypeId = "tshirt",
  opts: { approve?: boolean; inventory?: number } = {},
) {
  const seller = await db.seller.findUniqueOrThrow({ where: { id: sellerId } });
  const p = getProvider(provider);
  const catalog = await p.listCatalog(contextFor(null));
  const product = catalog.find((c) => c.productType === productTypeId)!;
  const design = await designAsset(sellerId);
  const deliverable = p.kind === "digital" ? await designAsset(sellerId, 2) : null;
  const res = await createListing(seller, {
    title: `${provider} ${productTypeId}`,
    description: "A test listing description.",
    priceCents,
    productType: productTypeId,
    kind: p.kind === "pod" ? "PARTNER" : p.kind === "self" ? "SELF_SHIP" : "DIGITAL",
    provider,
    partnerProductId: p.kind === "pod" ? product.id : null,
    partnerVariantIds: p.kind === "pod" ? [product.variants[0].id] : [],
    baseCostCents: 0,
    shippingCents: p.kind === "self" ? 400 : null,
    processingDays: 3,
    inventory: p.kind === "self" ? opts.inventory ?? 5 : null,
    aiTool: "Midjourney",
    aiInvolvement: "FULL",
    howMade: "Generated from a prompt and printed as generated.",
    prompt: "test",
    generationId: null,
    designAssetId: design.id,
    deliverableAssetId: deliverable?.id ?? null,
    licenseKey: "personal",
    tags: [],
    images: [{ kind: "DESIGN", alt: "x" }],
    rightsConfirmed: true,
    publish: true,
  });
  if (res.problems.length) throw new Error(res.problems.join(" "));
  if (opts.approve !== false) {
    const version = await db.listingVersion.findFirstOrThrow({ where: { listingId: res.id, status: "PENDING_REVIEW" } });
    await approveVersion((await reviewer()).id, version.id, "test", null);
  }
  return res.id;
}
