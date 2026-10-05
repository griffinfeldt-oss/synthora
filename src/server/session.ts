import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** The signed-in user (with seller profile), or null. Cached per request. */
export const currentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findUnique({ where: { id }, include: { seller: true } });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export function isAdmin(user: { role: string; email: string } | null | undefined): boolean {
  return Boolean(user && (user.role === "ADMIN" || env.adminEmails.includes(user.email.toLowerCase())));
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

export async function requireAdmin() {
  const user = await requireUser("/admin");
  if (!isAdmin(user)) redirect("/");
  return user;
}
