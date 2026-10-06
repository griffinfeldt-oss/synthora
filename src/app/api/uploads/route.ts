// Local (demo) storage upload: multipart form with `file` and `kind`. The file is
// written to quarantine and checked exactly as an S3 upload would be.
import { NextResponse } from "next/server";
import { mock } from "@/lib/env";
import { sameOrigin } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { putObject } from "@/lib/storage";
import { MAX_LOCAL_BYTES, validateUpload, type UploadKind } from "@/lib/uploads";
import { AssetError, ingestUpload, quarantineKey } from "@/server/assets";
import { currentUser } from "@/server/session";

export async function POST(req: Request) {
  if (!mock.storage) return NextResponse.json({ error: "Use /api/uploads/presign" }, { status: 400 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await currentUser();
  if (!user?.seller) return NextResponse.json({ error: "Sellers only" }, { status: 401 });
  if (!(await hit("upload", user.seller.id))) return NextResponse.json({ error: "Too many uploads this hour." }, { status: 429 });
  const form = await req.formData();
  const file = form.get("file");
  const rawKind = String(form.get("kind"));
  const kind: UploadKind = rawKind === "digital" ? "digital" : rawKind === "artwork" ? "artwork" : "image";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const problem = validateUpload(kind, file.name, file.type, file.size) ?? (file.size > MAX_LOCAL_BYTES ? "Demo storage accepts files up to 50 MB." : null);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const key = quarantineKey(user.seller.id, file.name);
  await putObject(key, Buffer.from(await file.arrayBuffer()), "application/octet-stream", "private");
  try {
    return NextResponse.json(await ingestUpload(user.seller.id, kind, key, file.name));
  } catch (e) {
    if (e instanceof AssetError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
