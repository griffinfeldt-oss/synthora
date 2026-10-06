// "Get help with this order": records that support was opened, then opens an
// email to support with the order number filled in.
import { NextResponse } from "next/server";
import { BRAND } from "@/config/brand";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { requestContext, track } from "@/server/analytics";
import { currentUser } from "@/server/session";

export async function GET(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const t = new URL(req.url).searchParams.get("t");
  const order = await db.order.findUnique({ where: { id: orderId } });
  const user = await currentUser();
  const allowed = order && ((user && order.buyerId === user.id) || (t && safeEqual(order.accessToken, t)));
  if (!order || !allowed) return new NextResponse("Not found", { status: 404 });
  await track({ name: "support_opened", orderId: order.id, ...(await requestContext(user)), isTest: order.mode !== "live" });
  const subject = encodeURIComponent(`Help with order ${order.number}`);
  const body = encodeURIComponent(`Order: ${order.number}\nWhat went wrong:\n\n`);
  return NextResponse.redirect(`mailto:${BRAND.supportEmail}?subject=${subject}&body=${body}`, { status: 302 });
}
