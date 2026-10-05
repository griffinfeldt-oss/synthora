// Local storage mode only: serves a private file for a valid signed link.
import { NextResponse } from "next/server";
import { mock } from "@/lib/env";
import { readLocal, verifyLocalDownload } from "@/lib/storage";

export async function GET(req: Request) {
  if (!mock.storage) return new NextResponse("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const key = sp.get("key") ?? "";
  const exp = Number(sp.get("exp"));
  const sig = sp.get("sig") ?? "";
  if (!key || !exp || !verifyLocalDownload(key, exp, sig)) return new NextResponse("Link expired", { status: 403 });
  const file = await readLocal("private", key);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const name = (sp.get("name") ?? "download").replace(/[^a-zA-Z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
