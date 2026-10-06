/**
 * Upload rules shared by the API routes and the browser. The browser's checks are
 * only a convenience: the server checks the real bytes again (src/server/assets.ts).
 *
 *  image    product photo, re-encoded and made public
 *  artwork  print file for a partner product: private original + public preview
 *  digital  the file buyers download: private only
 */
export type UploadKind = "image" | "artwork" | "digital";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ARTWORK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const DIGITAL_EXTENSIONS = ["pdf", "zip", "png", "jpg", "jpeg", "webp", "svg", "mp3", "wav", "epub", "txt", "pes", "dst", "jef", "exp", "vp3"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_ARTWORK_BYTES = 60 * 1024 * 1024;
export const MAX_DIGITAL_BYTES = 200 * 1024 * 1024;
export const MAX_LOCAL_BYTES = 50 * 1024 * 1024;

export function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateUpload(kind: UploadKind, fileName: string, contentType: string, size: number): string | null {
  if (size <= 0) return "That file is empty.";
  if (kind === "image") {
    if (!IMAGE_TYPES.includes(contentType)) return "Photos must be PNG, JPEG, WebP or GIF.";
    if (size > MAX_IMAGE_BYTES) return "Photos must be under 15 MB.";
  } else if (kind === "artwork") {
    if (!ARTWORK_TYPES.includes(contentType) && extOf(fileName) !== "svg") return "Artwork must be PNG, JPEG, WebP or SVG.";
    if (size > MAX_ARTWORK_BYTES) return "Artwork must be under 60 MB.";
  } else {
    if (!DIGITAL_EXTENSIONS.includes(extOf(fileName))) return `Allowed file types: ${DIGITAL_EXTENSIONS.join(", ")}.`;
    if (size > MAX_DIGITAL_BYTES) return "Files must be under 200 MB.";
  }
  return null;
}

export function maxBytesFor(kind: UploadKind): number {
  return kind === "image" ? MAX_IMAGE_BYTES : kind === "artwork" ? MAX_ARTWORK_BYTES : MAX_DIGITAL_BYTES;
}
