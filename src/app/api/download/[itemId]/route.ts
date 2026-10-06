// Digital delivery: checks the buyer holds an active entitlement, then redirects
// to a short-lived signed link for the exact file version they bought.
import { NextResponse } from "next/server";
import { BRAND } from "@/config/brand";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { privateDownloadUrl } from "@/lib/storage";
import { requestContext, track } from "@/server/analytics";
import { currentUser } from "@/server/session";

export async function GET(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const item = await db.orderItem.findUnique({
    where: { id: itemId },
    include: { order: true, entitlement: { include: { asset: true } } },
  });
  // Not found and not allowed look the same, so ids cannot be probed.
  if (!item?.entitlement) return new NextResponse("Not found", { status: 404 });
  const tokenOk = Boolean(token && safeEqual(item.order.accessToken, token));
  const user = await currentUser();
  const allowed = tokenOk || (user && item.order.buyerId === user.id);
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const ent = item.entitlement;
  if (!item.order.paidAt || ent.status !== "ACTIVE") {
    return new NextResponse(ent.revokedReason === "Refunded" ? "This item was refunded, so the download is no longer available." : "This download is not available.", { status: 403 });
  }
  // Count atomically so parallel requests cannot exceed the limit.
  const counted = await db.entitlement.updateMany({ where: { id: ent.id, status: "ACTIVE", downloadCount: { lt: ent.maxDownloads } }, data: { downloadCount: { increment: 1 } } });
  if (counted.count === 0) {
    return new NextResponse(`Download limit reached. Contact ${BRAND.supportEmail} and we'll help.`, { status: 429 });
  }
  const url = await privateDownloadUrl(ent.asset.storageKey, ent.asset.fileName, 300);
  const ctx = await requestContext(user);
  await track({
    name: "download_succeeded",
    orderId: item.orderId,
    listingId: item.listingId,
    listingVersionId: item.listingVersionId,
    ...ctx,
    isTest: item.order.mode !== "live",
    props: { assetId: ent.assetId, n: ent.downloadCount + 1 },
  });
  return NextResponse.redirect(url, { status: 302 });
}
