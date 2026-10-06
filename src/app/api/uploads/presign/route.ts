// Step 1 of an upload. With S3 configured, returns a presigned PUT into the
// private quarantine area (Vercel functions cap request bodies at ~4.5 MB).
// Nothing is usable until step 2 (/api/uploads/complete) has checked the bytes.
import { NextResponse } from "next/server";
import { z } from "zod";
import { mock } from "@/lib/env";
import { sameOrigin } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { presignQuarantineUpload } from "@/lib/storage";
import { validateUpload } from "@/lib/uploads";
import { quarantineKey } from "@/server/assets";
import { currentUser } from "@/server/session";

const schema = z.object({ kind: z.enum(["image", "artwork", "digital"]), fileName: z.string().min(1).max(200), contentType: z.string().max(100), size: z.number().int().positive() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await currentUser();
  if (!user?.seller) return NextResponse.json({ error: "Sellers only" }, { status: 401 });
  if (!(await hit("upload", user.seller.id))) return NextResponse.json({ error: "Too many uploads this hour." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { kind, fileName, contentType, size } = parsed.data;
  const problem = validateUpload(kind, fileName, contentType, size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (mock.storage) return NextResponse.json({ mode: "local" });
  const key = quarantineKey(user.seller.id, fileName);
  const uploadUrl = await presignQuarantineUpload(key, contentType || "application/octet-stream");
  return NextResponse.json({ mode: "s3", uploadUrl, key });
}
