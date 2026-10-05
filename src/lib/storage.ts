/**
 * File storage. S3-compatible in production (Supabase Storage, R2, S3);
 * local disk under .data/storage in mock mode.
 *
 * Two areas:
 *  - public:  product images and AI designs, served by URL
 *  - private: digital products, only reachable through short-lived signed links
 */
import "server-only";
import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, mock } from "./env";
import { safeEqual } from "./crypto";

export type Visibility = "public" | "private";

const LOCAL_ROOT = path.join(process.cwd(), ".data", "storage");

let s3: S3Client | null = null;
function client(): S3Client {
  s3 ??= new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  return s3;
}

function bucket(visibility: Visibility): string {
  return visibility === "public" ? env.s3.publicBucket : env.s3.privateBucket || env.s3.publicBucket;
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

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  visibility: Visibility,
): Promise<{ key: string; url: string | null }> {
  const k = safeKey(key);
  if (mock.storage) {
    const file = path.join(LOCAL_ROOT, visibility, k);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  } else {
    await client().send(
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

/** Local mode only: read a stored file. */
export async function readLocal(
  visibility: Visibility,
  key: string,
): Promise<{ data: Buffer; contentType: string; size: number } | null> {
  const file = path.join(LOCAL_ROOT, visibility, safeKey(key));
  if (!file.startsWith(path.join(LOCAL_ROOT, visibility))) return null;
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

/** A link to a private file that works for `ttlSeconds`. */
export async function privateDownloadUrl(key: string, fileName: string, ttlSeconds = 300): Promise<string> {
  const k = safeKey(key);
  if (mock.storage) {
    const exp = Date.now() + ttlSeconds * 1000;
    const params = new URLSearchParams({ key: k, exp: String(exp), sig: signLocalDownload(k, exp), name: fileName });
    return `/api/download/file?${params.toString()}`;
  }
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket("private"),
      Key: k,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
    }),
    { expiresIn: ttlSeconds },
  );
}

/** Fetch a public file's bytes (used to hand designs to partners and to re-host partner mockups). */
export async function fetchPublicBytes(url: string): Promise<Buffer | null> {
  if (url.startsWith("/api/files/")) {
    const file = await readLocal("public", decodeURIComponent(url.replace("/api/files/", "")));
    return file?.data ?? null;
  }
  const res = await fetch(url);
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/** Absolute URL for a stored public file, for partners that fetch print files themselves. */
export function absoluteUrl(url: string): string {
  return url.startsWith("http") ? url : `${env.appUrl}${url}`;
}
