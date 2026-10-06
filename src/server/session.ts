import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { adminMfaRequired, hasFreshMfa } from "./identity";

/** The signed-in user (with seller profile), or null. Cached per request. */
export const currentUser = cache(async () => {
  let session;
  try {
    session = await auth();
  } catch (e) {
    // Called outside a request (scripts, tests): nobody is signed in.
    if (String(e).includes("outside a request scope")) return null;
    throw e;
  }
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id }, include: { seller: true } });
  // A password reset bumps sessionVersion, which signs out every older session.
  if (!user || (session?.user?.sv ?? 0) !== user.sessionVersion) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/**
 * Admin authority comes only from the stored role on a verified account.
 * Roles are granted by the seed or `npm run admin:grant`, never by an email string.
 */
export function isAdmin(user: { role: string; emailVerified: Date | null } | null | undefined): boolean {
  return Boolean(user && user.role === "ADMIN" && user.emailVerified);
}

export async function requireUser(next = "/account"): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireSeller(next = "/seller") {
  const user = await requireUser(next);
  if (!user.seller) redirect("/seller/onboarding");
  return { user, seller: user.seller };
}

/** Admin pages and actions: verified admin role plus a recent second factor. */
export async function requireAdmin(next = "/admin") {
  const user = await requireUser(next);
  if (!isAdmin(user)) redirect("/");
  if (adminMfaRequired() && !(await hasFreshMfa(user))) {
    redirect(`/two-factor?next=${encodeURIComponent(next)}`);
  }
  return user;
}
