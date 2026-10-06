/**
 * AI usage budget. Every generation reserves its estimated cost before the
 * provider is called, inside a transaction holding a lock, so concurrent requests
 * cannot all slip under a limit. Failed or canceled calls release the budget.
 */
import "server-only";
import type { Seller } from "@prisma/client";
import { LAUNCH } from "@/config/launch";
import { db } from "@/lib/db";

export class BudgetError extends Error {}

export type UsageKind = "image" | "copy";

/** Is this seller allowed to use paid AI at all? */
export function aiEligibility(seller: Pick<Seller, "status" | "subscriptionStatus">): string | null {
  if (!LAUNCH.ai.enabled) return "AI generation is switched off right now.";
  if (!LAUNCH.generationStudio) return "The AI studio is not part of this launch.";
  if (LAUNCH.ai.requireActiveSeller && (seller.status !== "APPROVED" || seller.subscriptionStatus !== "ACTIVE")) {
    return "The AI studio opens once your shop is approved and your plan is active.";
  }
  return null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function reserveUsage(sellerId: string, kind: UsageKind, units: number, estCostCents: number): Promise<string> {
  const cfg = LAUNCH.ai;
  if (!cfg.enabled) throw new BudgetError("AI generation is switched off right now.");
  const now = new Date();
  return db.$transaction(async (tx) => {
    // One reservation decision at a time across all servers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('synthora:ai-budget'))`;
    await tx.usageReservation.updateMany({ where: { status: "RESERVED", expiresAt: { lt: now } }, data: { status: "RELEASED" } });

    const live = { sellerId, kind, status: { in: ["RESERVED", "COMMITTED"] as Array<"RESERVED" | "COMMITTED"> } };
    if (kind === "image") {
      const [hour, day, running] = await Promise.all([
        tx.usageReservation.count({ where: { ...live, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } }),
        tx.usageReservation.count({ where: { ...live, createdAt: { gt: new Date(now.getTime() - 86_400_000) } } }),
        tx.usageReservation.count({ where: { sellerId, kind, status: "RESERVED" } }),
      ]);
      if (running >= cfg.concurrentBatchesPerSeller) throw new BudgetError("Your last set of designs is still being made. Wait for it to finish.");
      if (hour >= cfg.batchesPerSellerPerHour) throw new BudgetError(`You've made ${hour} sets of designs this hour. Try again later.`);
      if (day >= cfg.batchesPerSellerPerDay) throw new BudgetError("You've reached today's design limit. It resets in 24 hours.");
    } else {
      const hour = await tx.usageReservation.count({ where: { ...live, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
      if (hour >= cfg.copyPerSellerPerHour) throw new BudgetError("You've drafted a lot of listings this hour. Try again later.");
    }

    if (estCostCents > 0) {
      const spent = await tx.$queryRaw<Array<{ total: bigint | null }>>`
        SELECT SUM(COALESCE("actualCostCents", "estCostCents"))::bigint AS total FROM "UsageReservation"
        WHERE "status" <> 'RELEASED' AND "createdAt" >= ${startOfUtcDay(now).toISOString()}::timestamp`;
      const total = Number(spent[0]?.total ?? 0);
      if (total + estCostCents > cfg.platformDailyBudgetCents) {
        throw new BudgetError("Synthora's AI budget for today is used up. Try again tomorrow.");
      }
    }

    const r = await tx.usageReservation.create({
      data: { sellerId, kind, units, estCostCents, expiresAt: new Date(now.getTime() + cfg.timeoutMs + 60_000) },
    });
    return r.id;
  });
}

export async function commitUsage(id: string, actualCostCents: number): Promise<void> {
  await db.usageReservation.updateMany({ where: { id, status: "RESERVED" }, data: { status: "COMMITTED", actualCostCents } });
}

export async function releaseUsage(id: string): Promise<void> {
  await db.usageReservation.updateMany({ where: { id, status: "RESERVED" }, data: { status: "RELEASED" } });
}

/** Today's estimated spend, for the admin overview. */
export async function aiSpendToday(): Promise<{ cents: number; batches: number }> {
  const since = startOfUtcDay(new Date());
  const [sum, batches] = await Promise.all([
    db.usageReservation.aggregate({ where: { status: { not: "RELEASED" }, createdAt: { gte: since } }, _sum: { actualCostCents: true, estCostCents: true } }),
    db.usageReservation.count({ where: { kind: "image", status: { not: "RELEASED" }, createdAt: { gte: since } } }),
  ]);
  return { cents: sum._sum.actualCostCents ?? sum._sum.estCostCents ?? 0, batches };
}
