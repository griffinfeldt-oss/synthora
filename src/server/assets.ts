/**
 * Server-owned files.
 *
 * Upload path: quarantine → read actual bytes → check owner, format, size and
 * content → store the canonical file (private for originals and deliverables) →
 * derive a reduced public preview → record an immutable Asset row.
 *
 * Listings reference Asset ids, never URLs typed by the browser.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { Asset, AssetKind } from "@prisma/client";
import { db } from "@/lib/db";
import { extensionMatches, sha256Hex, sniff, svgProblem, zipProblem, type Sniffed } from "@/lib/file-inspect";
import { deleteObject, privateDownloadUrl, publicUrl, putObject, readObject, safeKey } from "@/lib/storage";
import { extOf, maxBytesFor, type UploadKind } from "@/lib/uploads";
import { audit } from "./notify";

export class AssetError extends Error {}

const PREVIEW_MAX_PX = 800;
const PHOTO_MAX_PX = 2400;

export function quarantineKey(sellerId: string, fileName: string): string {
  const ext = extOf(fileName).replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  return `quarantine/${sellerId}/${randomBytes(10).toString("hex")}.${ext}`;
}

function safeFileName(name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80);
  return clean || "file";
}

async function imageSize(bytes: Buffer): Promise<{ width: number | null; height: number | null }> {
  try {
    const meta = await sharp(bytes, { limitInputPixels: 268_402_689 }).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

/** Hook for a real malware scanner. Format checks have already run. */
async function scanForThreats(_bytes: Buffer, _detected: Sniffed | null): Promise<string | null> {
  return null;
}

/** A reduced, re-encoded public copy of a private image original. */
export async function createPreview(original: Pick<Asset, "id" | "sellerId" | "contentType">, bytes: Buffer): Promise<Asset> {
  const input = original.contentType === "image/svg+xml" ? sharp(bytes, { density: 96 }) : sharp(bytes);
  const webp = await input
    .rotate()
    .resize({ width: PREVIEW_MAX_PX, height: PREVIEW_MAX_PX, fit: "inside" })
    .webp({ quality: 74 })
    .toBuffer();
  const meta = await sharp(webp).metadata();
  const id = randomBytes(12).toString("hex");
  const key = `previews/${original.sellerId ?? "platform"}/${id}.webp`;
  await putObject(key, webp, "image/webp", "public");
  return db.asset.create({
    data: {
      sellerId: original.sellerId,
      kind: "PREVIEW",
      visibility: "public",
      storageKey: key,
      fileName: `${id}.webp`,
      contentType: "image/webp",
      sizeBytes: webp.length,
      sha256: sha256Hex(webp),
      width: meta.width ?? null,
      height: meta.height ?? null,
      status: "READY",
      previewOfId: original.id,
    },
  });
}

/** Store a file the platform produced itself (AI designs). */
export async function storeOriginal(input: {
  sellerId: string;
  kind: AssetKind;
  bytes: Buffer;
  contentType: string;
  ext: string;
  fileName?: string;
  generationId?: string | null;
}): Promise<{ original: Asset; preview: Asset | null }> {
  const id = randomBytes(12).toString("hex");
  const key = `${input.kind === "GENERATED_DESIGN" ? "designs" : "files"}/${input.sellerId}/${id}.${input.ext}`;
  await putObject(key, input.bytes, input.contentType, "private");
  const size = input.contentType.startsWith("image/") ? await imageSize(input.bytes) : { width: null, height: null };
  const original = await db.asset.create({
    data: {
      sellerId: input.sellerId,
      kind: input.kind,
      visibility: "private",
      storageKey: key,
      fileName: input.fileName ?? `${id}.${input.ext}`,
      contentType: input.contentType,
      sizeBytes: input.bytes.length,
      sha256: sha256Hex(input.bytes),
      width: size.width,
      height: size.height,
      status: "READY",
      generationId: input.generationId ?? null,
    },
  });
  const preview = input.contentType.startsWith("image/") ? await createPreview(original, input.bytes) : null;
  return { original, preview };
}

export interface IngestResult {
  assetId: string;
  /** Public URL to show: the photo itself, or the preview of a private original. */
  url: string | null;
  previewAssetId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

async function reject(sellerId: string, key: string, reason: string): Promise<never> {
  await deleteObject("private", key).catch(() => undefined);
  await audit(null, "upload.rejected", "Seller", sellerId, { key, reason });
  throw new AssetError(reason);
}

/** Check a quarantined upload and turn it into a READY asset owned by the seller. */
export async function ingestUpload(sellerId: string, kind: UploadKind, key: string, declaredName: string): Promise<IngestResult> {
  const k = safeKey(key);
  if (!k.startsWith(`quarantine/${sellerId}/`)) throw new AssetError("That upload does not belong to your account.");
  const stored = await readObject("private", k);
  if (!stored) throw new AssetError("The upload did not arrive. Try again.");
  const bytes = stored.data;
  if (bytes.length === 0 || bytes.length > maxBytesFor(kind)) return reject(sellerId, k, "That file is empty or too large.");

  const detected = sniff(bytes);
  const ext = extOf(declaredName);
  const threat = await scanForThreats(bytes, detected);
  if (threat) return reject(sellerId, k, threat);

  const fileName = safeFileName(declaredName);
  let result: IngestResult;

  if (kind === "image") {
    if (!detected || detected.family !== "image") return reject(sellerId, k, "Photos must be PNG, JPEG, WebP or GIF images.");
    // Re-encode: strips metadata (including location) and anything that is not pixels.
    let webp: Buffer;
    try {
      webp = await sharp(bytes, { animated: false }).rotate().resize({ width: PHOTO_MAX_PX, height: PHOTO_MAX_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    } catch {
      return reject(sellerId, k, "That image could not be read.");
    }
    const size = await imageSize(webp);
    const id = randomBytes(12).toString("hex");
    const finalKey = `photos/${sellerId}/${id}.webp`;
    await putObject(finalKey, webp, "image/webp", "public");
    const asset = await db.asset.create({
      data: { sellerId, kind: "UPLOAD_IMAGE", visibility: "public", storageKey: finalKey, fileName: fileName.replace(/\.[a-z0-9]+$/, ".webp"), contentType: "image/webp", sizeBytes: webp.length, sha256: sha256Hex(webp), width: size.width, height: size.height, status: "READY" },
    });
    result = { assetId: asset.id, url: publicUrl(finalKey), previewAssetId: null, fileName: asset.fileName, contentType: asset.contentType, sizeBytes: asset.sizeBytes, width: asset.width, height: asset.height };
  } else {
    // artwork and digital files stay private; images among them get a preview.
    const embroideryByExt = !detected && ["jef", "exp"].includes(ext);
    if (!detected && !embroideryByExt) return reject(sellerId, k, "We couldn't recognise that file type.");
    if (detected && !extensionMatches(declaredName, detected)) return reject(sellerId, k, `The file's contents are ${detected.ext.toUpperCase()}, but its name ends in .${ext}. Rename it or export it again.`);
    if (kind === "artwork" && (!detected || (detected.family !== "image" && detected.family !== "vector") || detected.ext === "gif")) {
      return reject(sellerId, k, "Artwork must be a PNG, JPEG, WebP or SVG image.");
    }
    if (detected?.family === "vector") {
      const problem = svgProblem(bytes);
      if (problem) return reject(sellerId, k, problem);
    }
    let zipInfo: ReturnType<typeof zipProblem> | null = null;
    if (detected?.family === "archive") {
      zipInfo = zipProblem(bytes);
      if (zipInfo.problem) return reject(sellerId, k, zipInfo.problem);
    }
    const contentType = detected?.mime ?? "application/octet-stream";
    const isImage = detected?.family === "image" || detected?.family === "vector";
    if (isImage) {
      try {
        await sharp(bytes, detected?.family === "vector" ? { density: 72 } : {}).metadata();
      } catch {
        return reject(sellerId, k, "That image could not be read.");
      }
    }
    const id = randomBytes(12).toString("hex");
    const finalKey = `${kind === "artwork" ? "artwork" : "digital"}/${sellerId}/${id}/${fileName}`;
    await putObject(finalKey, bytes, contentType, "private");
    const size = isImage ? await imageSize(bytes) : { width: null, height: null };
    const original = await db.asset.create({
      data: { sellerId, kind: "UPLOAD_FILE", visibility: "private", storageKey: finalKey, fileName, contentType, sizeBytes: bytes.length, sha256: sha256Hex(bytes), width: size.width, height: size.height, status: "READY" },
    });
    const preview = isImage ? await createPreview(original, bytes) : null;
    result = {
      assetId: original.id,
      url: preview ? publicUrl(preview.storageKey) : null,
      previewAssetId: preview?.id ?? null,
      fileName: original.fileName,
      contentType,
      sizeBytes: original.sizeBytes,
      width: original.width,
      height: original.height,
    };
    if (zipInfo) await audit(null, "upload.zip_checked", "Asset", original.id, { entries: zipInfo.entries, uncompressedBytes: zipInfo.uncompressedBytes });
  }

  await deleteObject("private", k).catch(() => undefined);
  return result;
}

// ─── Ownership ───────────────────────────────────────────────────────────────

/** Load assets and confirm the seller owns each one and it passed its checks. */
export async function ownedAssets(sellerId: string, ids: Array<string | null | undefined>): Promise<Map<string, Asset>> {
  const wanted = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  if (wanted.length === 0) return new Map();
  const assets = await db.asset.findMany({ where: { id: { in: wanted } } });
  const map = new Map(assets.map((a) => [a.id, a]));
  for (const id of wanted) {
    const a = map.get(id);
    if (!a || a.sellerId !== sellerId) throw new AssetError("A file in this listing does not belong to your account.");
    if (a.status !== "READY") throw new AssetError("A file in this listing has not passed its checks.");
  }
  return map;
}

export async function previewFor(originalId: string): Promise<Asset | null> {
  return db.asset.findFirst({ where: { previewOfId: originalId, kind: "PREVIEW", status: "READY" }, orderBy: { createdAt: "asc" } });
}

export function assetPublicUrl(asset: Pick<Asset, "storageKey" | "visibility">): string {
  if (asset.visibility !== "public") throw new AssetError("That file is private.");
  return publicUrl(asset.storageKey);
}

/** A time-limited link to a private original, for print partners and admins. */
export async function signedOriginalUrl(asset: Pick<Asset, "storageKey" | "fileName">, ttlSeconds: number): Promise<string> {
  return privateDownloadUrl(asset.storageKey, asset.fileName, ttlSeconds);
}

export async function readAssetBytes(asset: Pick<Asset, "storageKey" | "visibility">): Promise<Buffer | null> {
  return (await readObject(asset.visibility === "public" ? "public" : "private", asset.storageKey))?.data ?? null;
}
