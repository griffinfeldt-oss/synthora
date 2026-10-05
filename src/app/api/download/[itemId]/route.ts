// Digital delivery: checks the buyer may download, then redirects to a
// short-lived signed URL for the private file.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { privateDownloadUrl } from "@/lib/storage";
import { currentUser } from "@/server/session";
import { BRAND } from "@/config/brand";

const MAX_DOWNLOADS = 20;

export async function GET(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const item = await db.orderItem.findUnique({
    where: { id: itemId },
    include: { order: true, sellerOrder: true, listing: { include: { digitalAsset: true } } },
  });
  if (!item || item.provider !== "digital" || !item.listing.digitalAsset) return new NextResponse("Not found", { status: 404 });
  const user = await currentUser();
  const allowed = (user && item.order.buyerId === user.id) || (token && safeEqual(item.order.accessToken, token));
  if (!allowed) return new NextResponse("Not found", { status: 404 });
  if (!item.order.paidAt || ["REFUNDED", "CANCELED"].includes(item.sellerOrder.status)) {
    return new NextResponse("This download is not available.", { status: 403 });
  }
  if (item.downloadCount >= MAX_DOWNLOADS) {
    return new NextResponse(`Download limit reached. Contact ${BRAND.supportEmail}.`, { status: 429 });
  }
  await db.orderItem.update({ where: { id: item.id }, data: { downloadCount: { increment: 1 } } });
  const asset = item.listing.digitalAsset;
  const url = await privateDownloadUrl(asset.storageKey, asset.fileName, 300);
  return NextResponse.redirect(url.startsWith("http") ? url : `${env.appUrl}${url}`, { status: 302 });
}
