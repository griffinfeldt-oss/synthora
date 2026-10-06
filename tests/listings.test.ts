/**
 * SYN-002, SYN-003, SYN-010, SYN-012: files, ownership, the studio's digital path,
 * technical checks, review and versioned delivery.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";

const { db } = await import("@/lib/db");
const { env } = await import("@/lib/env");
const { bucket, putObject, readObject, StorageConfigError } = await import("@/lib/storage");
const { setPaymentGateway } = await import("@/lib/payments");
const { MockGateway } = await import("@/lib/payments/mock");
const { connectPartner } = await import("@/server/sellers");
const { ingestUpload, quarantineKey, storeOriginal, AssetError } = await import("@/server/assets");
const { generateDesigns } = await import("@/server/studio");
const { createListing, approveVersion, requestChanges, updateListingBasics, submitForReview, ListingError } = await import("@/server/listings");
const { applyRefund } = await import("@/server/refunds");
const downloadRoute = await import("@/app/api/download/[itemId]/route");
const { resetDb, makeSeller } = await import("./support/db");
const { approvedListing, designAsset, reviewer } = await import("./support/listings");
const { paidOrder } = await import("./support/orders");

beforeAll(() => setPaymentGateway(new MockGateway()));
beforeEach(async () => {
  await resetDb();
});

async function quarantine(sellerId: string, name: string, bytes: Buffer) {
  const key = quarantineKey(sellerId, name);
  await putObject(key, bytes, "application/octet-stream", "private");
  return key;
}

async function download(itemId: string, token: string) {
  return downloadRoute.GET(new Request(`http://localhost/api/download/${itemId}?t=${token}`), { params: Promise.resolve({ itemId }) });
}

describe("uploads are checked by their bytes", () => {
  it("re-encodes photos to public WebP and keeps artwork originals private with a smaller public preview", async () => {
    const s = await makeSeller("alpha");
    const png = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#cc3333" } }).png().toBuffer();
    const photo = await ingestUpload(s.id, "image", await quarantine(s.id, "photo.png", png), "photo.png");
    expect(photo.contentType).toBe("image/webp");
    expect(photo.url).toMatch(/^\/api\/files\/photos\//);

    const art = await ingestUpload(s.id, "artwork", await quarantine(s.id, "art.png", png), "art.png");
    const original = await db.asset.findUniqueOrThrow({ where: { id: art.assetId } });
    expect(original.visibility).toBe("private");
    expect(original.width).toBe(2000);
    expect(original.sha256).toMatch(/^[0-9a-f]{64}$/);
    const preview = await db.asset.findUniqueOrThrow({ where: { id: art.previewAssetId! } });
    expect(preview.visibility).toBe("public");
    expect(Math.max(preview.width!, preview.height!)).toBeLessThanOrEqual(800);
    // The original is not reachable through public storage.
    expect(await readObject("public", original.storageKey)).toBeNull();
  });

  it("rejects disguised, active or dangerous files and other sellers' uploads", async () => {
    const s = await makeSeller("alpha");
    const other = await makeSeller("beta");
    await expect(ingestUpload(s.id, "image", await quarantine(s.id, "x.png", Buffer.from("just some text, not an image")), "x.png")).rejects.toThrow(AssetError);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(ingestUpload(s.id, "digital", await quarantine(s.id, "a.svg", svg), "a.svg")).rejects.toThrow(/scripts/);
    const pdfAsPng = Buffer.from("%PDF-1.7\n...");
    await expect(ingestUpload(s.id, "digital", await quarantine(s.id, "b.png", pdfAsPng), "b.png")).rejects.toThrow(/contents are PDF/);
    // A zip containing a program.
    const zip = fakeZip("setup.exe");
    await expect(ingestUpload(s.id, "digital", await quarantine(s.id, "pack.zip", zip), "pack.zip")).rejects.toThrow(/programs or scripts/);
    const theirs = await quarantine(other.id, "z.png", Buffer.from("x"));
    await expect(ingestUpload(s.id, "image", theirs, "z.png")).rejects.toThrow(/does not belong/);
  });

  it("never falls back to the public bucket for private files", () => {
    const saved = { ...env.s3 };
    try {
      env.s3.publicBucket = "pub";
      env.s3.privateBucket = "";
      expect(() => bucket("private")).toThrow(StorageConfigError);
      env.s3.privateBucket = "pub";
      expect(() => bucket("private")).toThrow(/different bucket/);
    } finally {
      Object.assign(env.s3, saved);
    }
  });
});

describe("studio digital listing, end to end (SYN-002)", () => {
  it("generate → save → submit → approve → buy → download the exact file", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const gen = await generateDesigns({ seller: s, prompt: "a fox under the moon", productType: "digital_art" });
    expect(gen.images).toHaveLength(4);
    const picked = gen.images[1];
    const original = await db.asset.findUniqueOrThrow({ where: { id: picked.assetId } });
    expect(original.visibility).toBe("private");
    expect(original.generationId).toBe(gen.generationId);

    const input = {
      title: "Moon Fox Print File",
      description: "A fox asleep under a full moon, as a printable file.",
      priceCents: 900,
      productType: "digital_art",
      kind: "DIGITAL" as const,
      provider: "digital",
      partnerVariantIds: [],
      baseCostCents: 0,
      processingDays: 0,
      aiTool: gen.model,
      aiInvolvement: "FULL" as const,
      howMade: "Made in the Synthora studio from a one-line prompt.",
      prompt: "a fox under the moon",
      generationId: gen.generationId,
      designAssetId: picked.assetId,
      deliverableAssetId: picked.assetId,
      licenseKey: "personal" as const,
      tags: [],
      images: [{ kind: "DESIGN" as const, alt: "preview" }],
      rightsConfirmed: true as const,
      publish: false,
    };
    const draft = await createListing(s, input);
    expect(draft.status).toBe("DRAFT");
    const submitted = await submitForReview(s.id, draft.id);
    expect(submitted.status).toBe("PENDING_REVIEW");
    // Not for sale while waiting.
    await expect(paidOrder([{ listingId: draft.id, quantity: 1 }], { shipTo: null })).rejects.toThrow(/no longer available/);

    const version = await db.listingVersion.findFirstOrThrow({ where: { listingId: draft.id } });
    expect((version.manifest as { disclosure: { generationRecorded: boolean } }).disclosure.generationRecorded).toBe(true);
    await approveVersion((await reviewer()).id, version.id, "Files open; disclosure plausible", null);

    const orderId = await paidOrder([{ listingId: draft.id, quantity: 1 }], { shipTo: null });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId }, include: { entitlement: true, order: true } });
    expect(item.entitlement?.assetId).toBe(picked.assetId);
    const res = await download(item.id, item.order.accessToken);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/api/download/file?");
    // Wrong token: indistinguishable from not found.
    expect((await download(item.id, "nope")).status).toBe(404);
  });

  it("refuses another seller's file, a forged generation link, and foreign image hosts (SYN-010)", async () => {
    const a = await makeSeller("alpha", { digital: true });
    const b = await makeSeller("beta");
    const theirs = await designAsset(b.id);
    const mine = await designAsset(a.id);
    const base = {
      title: "Thing", description: "A thing for sale here.", priceCents: 900, productType: "digital_art", kind: "DIGITAL" as const, provider: "digital",
      partnerVariantIds: [], baseCostCents: 0, processingDays: 0, aiTool: "Flux", aiInvolvement: "FULL" as const, howMade: "Generated and sold as generated, no edits.",
      licenseKey: "personal" as const, tags: [], images: [{ kind: "DESIGN" as const, alt: "x" }], rightsConfirmed: true as const, publish: false,
    };
    await expect(createListing(a, { ...base, designAssetId: theirs.id, deliverableAssetId: mine.id })).rejects.toThrow(ListingError);
    const gen = await db.generation.create({ data: { sellerId: b.id, model: "x", prompt: "x", productType: "digital_art", images: [] } });
    await expect(createListing(a, { ...base, designAssetId: mine.id, deliverableAssetId: mine.id, generationId: gen.id })).rejects.toThrow(/did not come from that generation/);
    await connectPartner({ sellerId: a.id, providerId: "printful", credentials: null, demo: true });
    await expect(
      createListing(a, {
        ...base, kind: "PARTNER", provider: "printful", productType: "tshirt", partnerProductId: "71", priceCents: 4000,
        designAssetId: mine.id, deliverableAssetId: null, images: [{ kind: "MOCKUP_PARTNER" as const, url: "https://evil.example.com/x.png", alt: "x" }],
      }),
    ).rejects.toThrow(/partner's mockup service/);
  });
});

describe("technical checks and review (SYN-012)", () => {
  it("blocks a raster design too small for every size offered, and says why", async () => {
    const s = await makeSeller("alpha");
    await connectPartner({ sellerId: s.id, providerId: "printful", credentials: null, demo: true });
    const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#123456" } }).png().toBuffer();
    const { original } = await storeOriginal({ sellerId: s.id, kind: "UPLOAD_FILE", bytes: png, contentType: "image/png", ext: "png" });
    const res = await createListing(s, {
      title: "Big Poster", description: "A very large poster print.", priceCents: 4000, productType: "poster", kind: "PARTNER", provider: "printful",
      partnerProductId: "1", partnerVariantIds: [], baseCostCents: 0, processingDays: 3, aiTool: "Flux", aiInvolvement: "FULL",
      howMade: "Generated and printed as generated, no edits.", licenseKey: "personal", tags: [], designAssetId: original.id,
      images: [{ kind: "DESIGN", alt: "x" }], rightsConfirmed: true, publish: true,
    });
    expect(res.status).toBe("DRAFT");
    expect(res.problems.join(" ")).toMatch(/too small to print/);
  });

  it("a file changed after it was checked cannot be published", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const file = await designAsset(s.id);
    await putObject(file.storageKey, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml", "private");
    const res = await createListing(s, {
      title: "Tampered", description: "A file that changed after upload.", priceCents: 900, productType: "digital_art", kind: "DIGITAL", provider: "digital",
      partnerVariantIds: [], baseCostCents: 0, processingDays: 0, aiTool: "Flux", aiInvolvement: "FULL", howMade: "Generated and sold as generated, no edits.",
      licenseKey: "personal", tags: [], designAssetId: file.id, deliverableAssetId: file.id, images: [{ kind: "DESIGN", alt: "x" }], rightsConfirmed: true, publish: true,
    });
    expect(res.problems.join(" ")).toMatch(/changed after it was checked/);
  });

  it("edits to a live listing wait for review while the approved version keeps selling", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const before = await db.listing.findUniqueOrThrow({ where: { id } });
    const res = await updateListingBasics(s.id, id, { title: "A New Title", description: before.description, priceCents: 1100, howMade: before.howMade, aiTool: before.aiTool, tags: [] });
    expect(res.review).toBe("pending");
    const live = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(live.title).toBe(before.title); // buyers still see the approved words
    expect(live.priceCents).toBe(1100); // price changes at once
    expect(live.status).toBe("ACTIVE");

    const pending = await db.listingVersion.findFirstOrThrow({ where: { listingId: id, status: "PENDING_REVIEW" } });
    const admin = await reviewer();
    await requestChanges(admin.id, pending.id, "Checked wording", "Please keep the original title format.");
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");

    await updateListingBasics(s.id, id, { title: "A Better Title", description: before.description, priceCents: 1100, howMade: before.howMade, aiTool: before.aiTool, tags: [] });
    const next = await db.listingVersion.findFirstOrThrow({ where: { listingId: id, status: "PENDING_REVIEW" } });
    await approveVersion(admin.id, next.id, "Checked wording", null);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).title).toBe("A Better Title");
    expect(await db.reviewDecision.count({ where: { listingId: id } })).toBe(3);
  });

  it("replacing a file never changes what past buyers can download (DEL-01)", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const orderId = await paidOrder([{ listingId: id, quantity: 1 }], { shipTo: null });
    const first = await db.entitlement.findFirstOrThrow({ where: { orderId } });

    const replacement = await designAsset(s.id, 9);
    await db.asset.update({ where: { id: replacement.id }, data: { fileName: "v2.svg" } });
    const listing = await db.listing.findUniqueOrThrow({ where: { id } });
    await updateListingBasics(s.id, id, { title: listing.title, description: listing.description, priceCents: listing.priceCents, howMade: listing.howMade, aiTool: listing.aiTool, tags: [], deliverableAssetId: replacement.id });
    const v = await db.listingVersion.findFirstOrThrow({ where: { listingId: id, status: "PENDING_REVIEW" } });
    await approveVersion((await reviewer()).id, v.id, "New file opens", null);

    expect((await db.listing.findUniqueOrThrow({ where: { id } })).deliverableAssetId).toBe(replacement.id);
    expect((await db.entitlement.findUniqueOrThrow({ where: { id: first.id } })).assetId).toBe(first.assetId);
    const second = await paidOrder([{ listingId: id, quantity: 1 }], { shipTo: null });
    expect((await db.entitlement.findFirstOrThrow({ where: { orderId: second } })).assetId).toBe(replacement.id);
  });

  it("a full refund revokes the download", async () => {
    const s = await makeSeller("alpha", { digital: true });
    const id = await approvedListing(s.id, "digital", 900, "digital_art");
    const orderId = await paidOrder([{ listingId: id, quantity: 1 }], { shipTo: null });
    const so = await db.sellerOrder.findFirstOrThrow({ where: { orderId } });
    await applyRefund({ sellerOrderId: so.id, reason: "File would not open", source: "admin" });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId }, include: { order: true } });
    expect((await download(item.id, item.order.accessToken)).status).toBe(403);
  });
});

/** A minimal zip whose central directory lists one file. */
function fakeZip(name: string): Buffer {
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(n.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + n.length, 12);
  eocd.writeUInt32LE(local.length + n.length, 16);
  return Buffer.concat([local, n, cd, n, eocd]);
}
