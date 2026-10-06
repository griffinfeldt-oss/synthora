import { NextResponse, type NextRequest } from "next/server";

// Gives each browser a random, first-party visitor id so the funnel can count
// unique visitors. It contains nothing personal and is not shared with anyone.
const ANON_COOKIE = "syn_aid";

export function proxy(request: NextRequest) {
  const res = NextResponse.next();
  if (!request.cookies.get(ANON_COOKIE)) {
    res.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export const config = {
  // Pages only: not API routes, static files, images or the favicon.
  matcher: ["/((?!api|_next/static|_next/image|favicon|samples|textures|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
