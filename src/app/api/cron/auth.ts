import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(req: Request): boolean {
  if (!env.cronSecret) return !env.isProduction;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${env.cronSecret}`);
}
