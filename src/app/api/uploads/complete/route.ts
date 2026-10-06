// Step 2 of an S3 upload: check the quarantined bytes and create the Asset.
import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/http";
import { AssetError, ingestUpload } from "@/server/assets";
import { currentUser } from "@/server/session";

export const maxDuration = 120;

const schema = z.object({ kind: z.enum(["image", "artwork", "digital"]), key: z.string().min(1).max(300), fileName: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await currentUser();
  if (!user?.seller) return NextResponse.json({ error: "Sellers only" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await ingestUpload(user.seller.id, parsed.data.kind, parsed.data.key, parsed.data.fileName));
  } catch (e) {
    if (e instanceof AssetError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
