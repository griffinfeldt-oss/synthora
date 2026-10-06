"use client";

import type { UploadKind } from "./uploads";

export interface UploadResult {
  assetId: string;
  /** Public URL to display (the photo, or a reduced preview of a private file). */
  url: string | null;
  previewAssetId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Upload a file. S3: presigned PUT into quarantine, then ask the server to check it.
 * Demo storage: one multipart request that does both.
 */
export async function uploadFile(file: File, kind: UploadKind): Promise<UploadResult> {
  const contentType = file.type || "application/octet-stream";
  const pre = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fileName: file.name, contentType, size: file.size }),
  });
  const preJson = (await pre.json()) as { mode?: string; uploadUrl?: string; key?: string; error?: string };
  if (!pre.ok) throw new Error(preJson.error ?? "Upload refused");
  if (preJson.mode === "s3") {
    const put = await fetch(preJson.uploadUrl!, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) throw new Error("Upload to storage failed");
    const done = await fetch("/api/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, key: preJson.key, fileName: file.name }),
    });
    const json = (await done.json()) as UploadResult & { error?: string };
    if (!done.ok) throw new Error(json.error ?? "The file did not pass its checks");
    return json;
  }
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const json = (await res.json()) as UploadResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json;
}
