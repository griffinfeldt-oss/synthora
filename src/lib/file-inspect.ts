/**
 * Byte-level checks for uploaded files. Browsers declare a name, type and size;
 * none of that is trusted. These checks look at the actual bytes.
 *
 * This is format validation, not antivirus. Images are also re-encoded before
 * they are made public, which drops anything that is not pixels. To add a real
 * malware scanner, call it from `scanForThreats` in src/server/assets.ts.
 */
import { createHash } from "node:crypto";

export interface Sniffed {
  /** Canonical extension for the detected format. */
  ext: string;
  mime: string;
  family: "image" | "vector" | "document" | "archive" | "audio" | "text" | "embroidery";
}

const startsWith = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString("latin1");

/** Detect a file's real format from its first bytes. */
export function sniff(b: Buffer): Sniffed | null {
  if (b.length < 4) return null;
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png", family: "image" };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg", family: "image" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp", family: "image" };
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return { ext: "gif", mime: "image/gif", family: "image" };
  if (ascii(b, 0, 5) === "%PDF-") return { ext: "pdf", mime: "application/pdf", family: "document" };
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    // EPUB is a zip whose first entry is an uncompressed "mimetype" file.
    if (ascii(b, 30, 38) === "mimetype" && ascii(b, 38, 58).startsWith("application/epub+zip")) return { ext: "epub", mime: "application/epub+zip", family: "document" };
    return { ext: "zip", mime: "application/zip", family: "archive" };
  }
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE") return { ext: "wav", mime: "audio/wav", family: "audio" };
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg", family: "audio" };
  if (ascii(b, 0, 4) === "#PES") return { ext: "pes", mime: "application/octet-stream", family: "embroidery" };
  if (ascii(b, 0, 5) === "%vsm%") return { ext: "vp3", mime: "application/octet-stream", family: "embroidery" };
  if (ascii(b, 0, 3) === "LA:") return { ext: "dst", mime: "application/octet-stream", family: "embroidery" };
  const head = b.subarray(0, Math.min(b.length, 2048)).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return { ext: "svg", mime: "image/svg+xml", family: "vector" };
  if (isPlainText(b)) return { ext: "txt", mime: "text/plain", family: "text" };
  return null;
}

function isPlainText(b: Buffer): boolean {
  const sample = b.subarray(0, Math.min(b.length, 8192));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/** Extensions that may share a detected format. */
const EXT_ALIASES: Record<string, string[]> = {
  jpg: ["jpg", "jpeg"],
  // Some embroidery formats have no reliable magic number; they are accepted only
  // by extension and never rendered or previewed.
  octet: ["jef", "exp"],
};

export function extensionMatches(fileName: string, detected: Sniffed): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return (EXT_ALIASES[detected.ext] ?? [detected.ext]).includes(ext);
}

/** SVGs from sellers must be inert: no script, event handlers or external references. */
export function svgProblem(b: Buffer): string | null {
  const text = b.toString("utf8");
  if (/<script[\s>]/i.test(text)) return "SVG files cannot contain scripts.";
  if (/\son[a-z]+\s*=/i.test(text)) return "SVG files cannot contain event handlers.";
  if (/javascript:/i.test(text)) return "SVG files cannot contain javascript: links.";
  if (/<foreignObject[\s>]/i.test(text)) return "SVG files cannot embed HTML (foreignObject).";
  if (/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i.test(text)) return "SVG files cannot load external files.";
  if (/<!ENTITY/i.test(text)) return "SVG files cannot declare XML entities.";
  return null;
}

const RISKY_IN_ARCHIVE = /\.(exe|dll|bat|cmd|com|scr|msi|ps1|vbs|js|jse|jar|app|dmg|pkg|sh|command|apk|lnk|hta|docm|xlsm|pptm)$/i;

/**
 * Read a zip's central directory. Rejects archives with executables, absolute or
 * parent paths, encrypted entries, or an implausible expansion ratio.
 */
export function zipProblem(b: Buffer, maxEntries = 2000, maxRatio = 100): { problem: string | null; entries: number; uncompressedBytes: number } {
  // End of central directory record: last 22..(22+65535) bytes.
  const from = Math.max(0, b.length - 22 - 65_535);
  let eocd = -1;
  for (let i = b.length - 22; i >= from; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { problem: "This zip file is incomplete or damaged.", entries: 0, uncompressedBytes: 0 };
  const entries = b.readUInt16LE(eocd + 10);
  const cdOffset = b.readUInt32LE(eocd + 16);
  if (entries > maxEntries) return { problem: `Zip files can contain at most ${maxEntries} files.`, entries, uncompressedBytes: 0 };
  let p = cdOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) return { problem: "This zip file is damaged.", entries, uncompressedBytes: total };
    const flags = b.readUInt16LE(p + 8);
    const uncompressed = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const name = b.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (flags & 0x1) return { problem: "Password-protected zip files are not accepted.", entries, uncompressedBytes: total };
    if (name.startsWith("/") || name.includes("..") || /^[a-z]:/i.test(name)) return { problem: `Unsafe path in zip: ${name}`, entries, uncompressedBytes: total };
    if (RISKY_IN_ARCHIVE.test(name)) return { problem: `Zip files cannot contain programs or scripts (${name}).`, entries, uncompressedBytes: total };
    total += uncompressed;
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (total > b.length * maxRatio) return { problem: "This zip expands to an implausible size.", entries, uncompressedBytes: total };
  return { problem: null, entries, uncompressedBytes: total };
}

export function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}
