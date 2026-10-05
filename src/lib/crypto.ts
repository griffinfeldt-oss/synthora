/**
 * AES-256-GCM encryption for partner credentials at rest.
 * ENCRYPTION_KEY is 32 random bytes, base64 encoded (`npm run setup` makes one).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set. Run `npm run setup` or add it to your environment.");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  return buf;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptJson<T = unknown>(payload: string): T {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Show only the last 4 characters of a secret, for the partners page. */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  return `••••${secret.slice(-4)}`;
}
