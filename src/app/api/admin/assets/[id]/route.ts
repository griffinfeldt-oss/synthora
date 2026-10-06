// Admins open a private original (for review) through a short-lived signed link.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signedOriginalUrl } from "@/server/assets";
import { adminMfaRequired, hasFreshMfa } from "@/server/identity";
import { audit } from "@/server/notify";
import { currentUser, isAdmin } from "@/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || !isAdmin(user) || (adminMfaRequired() && !(await hasFreshMfa(user)))) return new NextResponse("Not found", { status: 404 });
  const asset = await db.asset.findUnique({ where: { id: (await params).id } });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  await audit(user.id, "asset.viewed_by_admin", "Asset", asset.id);
  return NextResponse.redirect(await signedOriginalUrl(asset, 120), { status: 302 });
}
