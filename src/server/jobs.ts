/**
 * Durable follow-up work. A job is written in the same transaction as the state
 * change that requires it, so "order paid" can never commit without its
 * notifications, dispatches and fee reconciliation being recorded.
 *
 * Jobs are claimed with a lease (SKIP LOCKED), retried with backoff, and after
 * maxAttempts become DEAD: shown in the admin action queue with an owner.
 * They run right after the triggering request and every few minutes from cron.
 */
import "server-only";
import type { Job, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface JobSpec {
  key: string;
  type: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  ownerRole?: string;
  maxAttempts?: number;
}

type Handler = (payload: Record<string, unknown>, job: Job) => Promise<void>;
const handlers = new Map<string, Handler>();

export function registerJob(type: string, handler: Handler): void {
  handlers.set(type, handler);
}

/** Record jobs. Pass the transaction client to tie them to the state change. */
export async function enqueue(client: Prisma.TransactionClient | typeof db, jobs: JobSpec[]): Promise<void> {
  if (!jobs.length) return;
  await client.job.createMany({
    data: jobs.map((j) => ({
      key: j.key,
      type: j.type,
      payload: j.payload as Prisma.InputJsonValue,
      runAt: j.runAt ?? new Date(),
      ownerRole: j.ownerRole ?? "operations",
      maxAttempts: j.maxAttempts ?? 8,
    })),
    skipDuplicates: true,
  });
}

const LEASE_SECONDS = 120;

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);
}

async function claim(limit: number, keys?: string[]): Promise<Job[]> {
  const keyFilter = keys?.length ? keys : null;
  // Timestamps are stored as UTC without a zone, so compare with times from the
  // app rather than the database's NOW() (which follows the server's time zone).
  // Bound as ISO text and cast, because Date parameters arrive as timestamptz and
  // would be shifted by the database session's time zone.
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
  return db.$queryRaw<Job[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "leaseUntil" = ${leaseUntil}::timestamp, "attempts" = "attempts" + 1, "updatedAt" = ${now}::timestamp
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE ((("status" = 'PENDING' OR "status" = 'FAILED') AND "runAt" <= ${now}::timestamp) OR ("status" = 'RUNNING' AND "leaseUntil" < ${now}::timestamp))
        AND (${keyFilter}::text[] IS NULL OR "key" = ANY(${keyFilter}::text[]))
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

export interface RunResult {
  ran: number;
  done: number;
  retrying: number;
  dead: number;
}

/** Run due jobs (optionally only the given keys). Never throws. */
export async function runJobs(opts: { limit?: number; keys?: string[] } = {}): Promise<RunResult> {
  await import("./job-handlers");
  const result: RunResult = { ran: 0, done: 0, retrying: 0, dead: 0 };
  let jobs: Job[];
  try {
    jobs = await claim(opts.limit ?? 25, opts.keys);
  } catch (e) {
    console.error("[jobs] claim failed", e);
    return result;
  }
  for (const job of jobs) {
    result.ran++;
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job.payload as Record<string, unknown>, job);
      await db.job.update({ where: { id: job.id }, data: { status: "DONE", leaseUntil: null, lastError: null } });
      result.done++;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const dead = job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: {
          status: dead ? "DEAD" : "FAILED",
          leaseUntil: null,
          lastError: message,
          runAt: dead ? job.runAt : new Date(Date.now() + backoffMs(job.attempts)),
          escalateAt: dead ? new Date() : undefined,
        },
      });
      if (dead) result.dead++;
      else result.retrying++;
    }
  }
  return result;
}

/** An operator retries a dead job from the action queue. */
export async function retryJob(id: string): Promise<void> {
  await db.job.update({ where: { id }, data: { status: "PENDING", runAt: new Date(), attempts: 0, escalateAt: null } });
  await runJobs({ keys: [(await db.job.findUniqueOrThrow({ where: { id } })).key] });
}
