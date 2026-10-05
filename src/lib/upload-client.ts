"use client";

export interface UploadResult {
  key: string;
  url: string | null;
  fileName: string;
  contentType: string;
  size: number;
}

/** Upload a file: presigned PUT to S3 in production, multipart to /api/uploads in demo mode. */
export async function uploadFile(file: File, kind: "image" | "digital"): Promise<UploadResult> {
  const contentType = file.type || "application/octet-stream";
  const pre = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fileName: file.name, contentType, size: file.size }),
  });
  const preJson = (await pre.json()) as { mode?: string; uploadUrl?: string; key?: string; url?: string | null; error?: string };
  if (!pre.ok) throw new Error(preJson.error ?? "Upload refused");
  if (preJson.mode === "s3") {
    const put = await fetch(preJson.uploadUrl!, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) throw new Error("Upload to storage failed");
    return { key: preJson.key!, url: preJson.url ?? null, fileName: file.name, contentType, size: file.size };
  }
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const json = (await res.json()) as { key?: string; url?: string | null; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return { key: json.key!, url: json.url ?? null, fileName: file.name, contentType, size: file.size };
}
