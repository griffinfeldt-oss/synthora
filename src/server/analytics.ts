/**
 * First-party funnel events (definitions in docs/METRICS.md).
 *
 * Every event says whether it is test/demo traffic, staff traffic or a bot, so
 * dashboards can count only independent, real demand. Events never block the
 * request that records them.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const EVENTS = [
  "product_viewed",
  "checkout_started",
  "payment_confirmed",
  "entitlement_issued",
  "download_succeeded",
  "support_opened",
  "refund_confirmed",
  "review_submitted",
] as const;
export type EventName = (typeof EVENTS)[number];

export const ANON_COOKIE = "syn_aid";
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|monitor/i;

export interface TrackInput {
  name: EventName;
  dedupeKey?: string;
  anonId?: string | null;
  userId?: string | null;
  listingId?: string | null;
  listingVersionId?: string | null;
  orderId?: string | null;
  props?: Record<string, unknown>;
  isTest?: boolean;
  isInternal?: boolean;
  isBot?: boolean;
}

export async function track(e: TrackInput): Promise<void> {
  try {
    await db.analyticsEvent.createMany({
      data: [
        {
          name: e.name,
          dedupeKey: e.dedupeKey ?? null,
          anonId: e.anonId ?? null,
          userId: e.userId ?? null,
          listingId: e.listingId ?? null,
          listingVersionId: e.listingVersionId ?? null,
          orderId: e.orderId ?? null,
          props: (e.props ?? undefined) as Prisma.InputJsonValue | undefined,
          isTest: e.isTest ?? env.mode !== "live",
          isInternal: e.isInternal ?? false,
          isBot: e.isBot ?? false,
        },
      ],
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("[analytics]", err);
  }
}

/** Context for events recorded during a page request. */
export async function requestContext(user: { id: string; role: string; isTest: boolean; seller?: { id: string } | null } | null) {
  let anonId: string | null = null;
  let isBot = false;
  try {
    anonId = (await cookies()).get(ANON_COOKIE)?.value ?? null;
    isBot = BOT_UA.test((await headers()).get("user-agent") ?? "");
  } catch {
    // outside a request
  }
  return {
    anonId,
    userId: user?.id ?? null,
    isBot,
    // Staff, seeded identities and sellers browsing are not demand.
    isInternal: Boolean(user && (user.role === "ADMIN" || user.isTest)),
  };
}
