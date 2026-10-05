// Local (demo) storage upload: multipart form with `file` and `kind`.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mock } from "@/lib/env";
import { putObject } from "@/lib/storage";
import { extOf, MAX_LOCAL_BYTES, validateUpload } from "@/lib/uploads";
import { currentUser } from "@/server/session";

export async function POST(req: Request) {
  if (!mock.storage) return NextResponse.json({ error: "Use /api/uploads/presign" }, { status: 400 });
  const user = await currentUser();
  if (!user?.seller) return NextResponse.json({ error: "Sellers only" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "digital" ? "digital" : "image";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const problem = validateUpload(kind, file.name, file.type, file.size) ?? (file.size > MAX_LOCAL_BYTES ? "Demo storage accepts files up to 50 MB." : null);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const ext = extOf(file.name);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80);
  const key = kind === "image" ? `uploads/${user.seller.id}/${randomBytes(8).toString("hex")}.${ext}` : `digital/${user.seller.id}/${randomBytes(8).toString("hex")}/${safeName}`;
  const { url } = await putObject(key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream", kind === "image" ? "public" : "private");
  return NextResponse.json({ key, url });
}
