/** Shared upload rules, used by the API routes and the client. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const DIGITAL_EXTENSIONS = ["pdf", "zip", "png", "jpg", "jpeg", "webp", "svg", "mp3", "wav", "epub", "txt", "pes", "dst", "jef", "exp", "vp3"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_DIGITAL_BYTES = 500 * 1024 * 1024;
export const MAX_LOCAL_BYTES = 50 * 1024 * 1024;

export function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateUpload(kind: "image" | "digital", fileName: string, contentType: string, size: number): string | null {
  if (kind === "image") {
    if (!IMAGE_TYPES.includes(contentType)) return "Images must be PNG, JPEG, WebP or GIF.";
    if (size > MAX_IMAGE_BYTES) return "Images must be under 15 MB.";
  } else {
    if (!DIGITAL_EXTENSIONS.includes(extOf(fileName))) return `Allowed file types: ${DIGITAL_EXTENSIONS.join(", ")}.`;
    if (size > MAX_DIGITAL_BYTES) return "Files must be under 500 MB.";
  }
  return null;
}
