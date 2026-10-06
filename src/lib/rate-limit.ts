/**
 * Fixed-window rate limits stored in Postgres, so they hold across serverless
 * instances. One atomic upsert per check.
 */
import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

export const LIMITS = {
  signIn: { max: 10, windowSeconds: 15 * 60 },
  signInPerEmail: { max: 8, windowSeconds: 15 * 60 },
  signUp: { max: 5, windowSeconds: 60 * 60 },
  emailSend: { max: 5, windowSeconds: 60 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  twoFactor: { max: 8, windowSeconds: 15 * 60 },
  upload: { max: 60, windowSeconds: 60 * 60 },
  report: { max: 10, windowSeconds: 60 * 60 },
  checkout: { max: 20, windowSeconds: 10 * 60 },
  waitlist: { max: 10, windowSeconds: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Count one hit; returns false once the limit for this window is exceeded. */
export async function hit(name: LimitName, subject: string): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const key = `${name}:${subject.toLowerCase().slice(0, 200)}`;
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart.toISOString()}::timestamp, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= max;
}

/** Best-effort client address for limits and security logs. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

/** Drop windows older than a day (called by the jobs cron). */
export async function pruneRateLimits(): Promise<number> {
  const res = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86_400_000) } } });
  return res.count;
}
