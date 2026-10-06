"use client";

import { useState } from "react";
import { uploadFile } from "@/lib/upload-client";

/** Uploads a replacement download file; the form then submits its new id for review. */
export function ReplaceFileField({ currentName }: { currentName: string | null }) {
  const [assetId, setAssetId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <label htmlFor="replace-file" className="block text-[13.5px] font-semibold">
        Download file
      </label>
      <p className="text-[13px] text-muted">
        Current: {currentName ?? "none"}. A new file goes to review; buyers who already bought keep the version they paid for.
      </p>
      <input
        id="replace-file"
        type="file"
        className="block text-[14px]"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setError(null);
          setStatus(`Uploading and checking ${f.name}…`);
          try {
            const res = await uploadFile(f, "digital");
            setAssetId(res.assetId);
            setStatus(`Checked: ${res.fileName}. Save to send it for review.`);
          } catch (err) {
            setStatus(null);
            setError(err instanceof Error ? err.message : "Upload failed");
          }
        }}
      />
      <input type="hidden" name="deliverableAssetId" value={assetId} />
      {status ? (
        <p className="text-[13px] font-semibold text-ok" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-[13px] font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
