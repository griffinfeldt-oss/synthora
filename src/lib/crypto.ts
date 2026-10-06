/**
 * AES-256-GCM encryption for partner credentials and admin 2FA secrets at rest.
 * ENCRYPTION_KEY is 32 random bytes, base64 encoded (`npm run setup` makes one).
 *
 * Rotation: set the new key as ENCRYPTION_KEY and the old one as
 * ENCRYPTION_KEY_PREVIOUS, deploy, run `npm run secrets:reencrypt`, then remove
 * ENCRYPTION_KEY_PREVIOUS. Reads try the current key, then the previous one.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function parseKey(raw: string | undefined, name: string): Buffer {
  if (!raw) throw new Error(`${name} is not set. Run \`npm run setup\` or add it to your environment.`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded.`);
  return buf;
}

function key(): Buffer {
  return parseKey(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
}

function previousKey(): Buffer | null {
  return process.env.ENCRYPTION_KEY_PREVIOUS ? parseKey(process.env.ENCRYPTION_KEY_PREVIOUS, "ENCRYPTION_KEY_PREVIOUS") : null;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decryptWith(k: Buffer, iv: string, tag: string, data: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
}

export function decryptJson<T = unknown>(payload: string): T {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised encrypted payload");
  let dec: Buffer;
  try {
    dec = decryptWith(key(), iv, tag, data);
  } catch (e) {
    const prev = previousKey();
    if (!prev) throw e;
    dec = decryptWith(prev, iv, tag, data);
  }
  return JSON.parse(dec.toString("utf8")) as T;
}

/** True when the payload is readable with the current key (used by rotation). */
export function isCurrentKey(payload: string): boolean {
  const [, iv, tag, data] = payload.split(".");
  try {
    decryptWith(key(), iv, tag, data);
    return true;
  } catch {
    return false;
  }
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
