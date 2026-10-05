// OAuth callback for partners that support it (Printful when PRINTFUL_CLIENT_ID is set).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getProvider, isOAuthAvailable } from "@/fulfillment/registry";
import { currentUser } from "@/server/session";
import { connectPartner } from "@/server/sellers";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const user = await currentUser();
  if (!user?.seller) return NextResponse.redirect(`${env.appUrl}/sign-in?next=/seller/partners`);
  const provider = getProvider(id);
  if (!provider.auth.oauth || !isOAuthAvailable(provider)) return NextResponse.redirect(`${env.appUrl}/seller/partners`);

  const sp = new URL(req.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(`oauth_${id}`)?.value ?? "";
  jar.delete(`oauth_${id}`);
  const code = sp.get("code");
  if (!code || !expected || !safeEqual(expected, sp.get("state") ?? "")) {
    return NextResponse.redirect(`${env.appUrl}/seller/partners?error=oauth`);
  }
  try {
    const credentials = await provider.auth.oauth.exchangeCode(code, `${env.appUrl}/api/partners/oauth/${id}`);
    await connectPartner({ sellerId: user.seller.id, providerId: id, credentials, demo: false, authType: "OAUTH" });
    return NextResponse.redirect(`${env.appUrl}/seller/partners?connected=${id}`);
  } catch {
    return NextResponse.redirect(`${env.appUrl}/seller/partners?error=oauth`);
  }
}
