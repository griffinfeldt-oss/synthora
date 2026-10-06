/**
 * File storage. S3-compatible in production (Supabase Storage, R2, S3, GCS);
 * local disk under .data/storage in demo mode.
 *
 * Two areas, and private never falls back to public:
 *  - public:  checked photos and reduced previews, served by URL
 *  - private: design originals, digital products and the upload quarantine,
 *             only reachable through short-lived signed links
 */
import "server-only";
import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, mock } from "./env";
import { safeEqual } from "./crypto";

export type Visibility = "public" | "private";

const LOCAL_ROOT = path.join(process.cwd(), ".data", "storage");

export class StorageConfigError extends Error {}

let s3: S3Client | null = null;
export function s3Client(): S3Client {
  s3 ??= new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  return s3;
}

/** The bucket for an area. A missing or shared private bucket is an error, never a fallback. */
export function bucket(visibility: Visibility): string {
  if (visibility === "public") {
    if (!env.s3.publicBucket) throw new StorageConfigError("S3_PUBLIC_BUCKET is not set.");
    return env.s3.publicBucket;
  }
  if (!env.s3.privateBucket) throw new StorageConfigError("S3_PRIVATE_BUCKET is not set. Private files are never stored in the public bucket.");
  if (env.s3.privateBucket === env.s3.publicBucket) throw new StorageConfigError("S3_PRIVATE_BUCKET must be a different bucket from S3_PUBLIC_BUCKET.");
  return env.s3.privateBucket;
}

export function safeKey(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/\.\.+/g, ".").replace(/^\/+/, "");
  if (!clean || clean.includes("..")) throw new Error("Invalid storage key");
  return clean;
}

export function publicUrl(key: string): string {
  if (mock.storage) return `/api/files/${safeKey(key)}`;
  return `${env.s3.publicUrl}/${safeKey(key)}`;
}

function localPath(visibility: Visibility, key: string): string {
  const root = path.join(LOCAL_ROOT, visibility);
  const file = path.join(root, safeKey(key));
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return file;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  visibility: Visibility,
): Promise<{ key: string; url: string | null }> {
  const k = safeKey(key);
  if (mock.storage) {
    const file = localPath(visibility, k);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  } else {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket(visibility),
        Key: k,
        Body: body,
        ContentType: contentType,
        CacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      }),
    );
  }
  return { key: k, url: visibility === "public" ? publicUrl(k) : null };
}

/** Read a stored object's bytes from either area. */
export async function readObject(visibility: Visibility, key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const k = safeKey(key);
  if (mock.storage) {
    const file = await readLocal(visibility, k);
    return file ? { data: file.data, contentType: file.contentType } : null;
  }
  try {
    const res = await s3Client().send(new GetObjectCommand({ Bucket: bucket(visibility), Key: k }));
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? { data: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" } : null;
  } catch (e) {
    if (e instanceof StorageConfigError) throw e;
    return null;
  }
}

export async function deleteObject(visibility: Visibility, key: string): Promise<void> {
  const k = safeKey(key);
  if (mock.storage) {
    const file = localPath(visibility, k);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
    return;
  }
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(visibility), Key: k }));
}

/** Local mode only: read a stored file. */
export async function readLocal(
  visibility: Visibility,
  key: string,
): Promise<{ data: Buffer; contentType: string; size: number } | null> {
  let file: string;
  try {
    file = localPath(visibility, key);
  } catch {
    return null;
  }
  try {
    const [data, meta, info] = await Promise.all([
      readFile(file),
      readFile(`${file}.meta.json`, "utf8").catch(() => '{"contentType":"application/octet-stream"}'),
      stat(file),
    ]);
    return { data, contentType: (JSON.parse(meta) as { contentType: string }).contentType, size: info.size };
  } catch {
    return null;
  }
}

function signingKey(): string {
  const key = process.env.AUTH_SECRET;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required to sign download links.");
  return "dev-signing-key";
}

export function signLocalDownload(key: string, expiresAt: number): string {
  return createHmac("sha256", signingKey()).update(`${key}:${expiresAt}`).digest("base64url");
}

export function verifyLocalDownload(key: string, expiresAt: number, sig: string): boolean {
  if (Date.now() > expiresAt) return false;
  return safeEqual(signLocalDownload(key, expiresAt), sig);
}

/** A link to a private file that works for `ttlSeconds` (S3 caps presigned links at 7 days). */
export async function privateDownloadUrl(key: string, fileName: string, ttlSeconds = 300): Promise<string> {
  const k = safeKey(key);
  if (mock.storage) {
    const exp = Date.now() + ttlSeconds * 1000;
    const params = new URLSearchParams({ key: k, exp: String(exp), sig: signLocalDownload(k, exp), name: fileName });
    return `${env.appUrl}/api/download/file?${params.toString()}`;
  }
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({
      Bucket: bucket("private"),
      Key: k,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, "")}"`,
    }),
    { expiresIn: Math.min(ttlSeconds, 7 * 24 * 3600) },
  );
}

/** Presigned PUT into the private quarantine area (S3 mode). */
export async function presignQuarantineUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3Client(), new PutObjectCommand({ Bucket: bucket("private"), Key: safeKey(key), ContentType: contentType }), { expiresIn: 600 });
}

/**
 * Check the real bucket policies: an object in the private bucket must not be
 * readable without a signature, and the public bucket must serve its objects.
 */
export async function probeBucketPolicies(): Promise<{ privateBlocked: boolean | null; publicReadable: boolean | null; detail: string }> {
  if (mock.storage) return { privateBlocked: true, publicReadable: true, detail: "Local disk: private files are only served through signed links." };
  const key = `healthcheck/probe-${Date.now()}.txt`;
  try {
    await putObject(key, Buffer.from("probe"), "text/plain", "private");
    await putObject(key, Buffer.from("probe"), "text/plain", "public");
    const base = env.s3.endpoint ? `${env.s3.endpoint.replace(/\/$/, "")}/${bucket("private")}` : `https://${bucket("private")}.s3.${env.s3.region}.amazonaws.com`;
    const anon = await fetch(`${base}/${key}`, { cache: "no-store" }).catch(() => null);
    const pub = await fetch(publicUrl(key), { cache: "no-store" }).catch(() => null);
    await Promise.all([deleteObject("private", key), deleteObject("public", key)]).catch(() => undefined);
    return {
      privateBlocked: anon ? anon.status === 403 || anon.status === 401 || anon.status === 400 : null,
      publicReadable: pub ? pub.ok : null,
      detail: `Unsigned private read returned ${anon?.status ?? "no response"}; public read returned ${pub?.status ?? "no response"}.`,
    };
  } catch (e) {
    return { privateBlocked: null, publicReadable: null, detail: e instanceof Error ? e.message : "Probe failed" };
  }
}
