/**
 * Durable external effects (transfers, refunds, reversals, partner orders).
 *
 * Each effect has a business key, so it can exist only once. Its state moves
 * REQUESTED → PROCESSING → CONFIRMED | FAILED | UNKNOWN:
 *  - CONFIRMED only with the provider's receipt (providerRef).
 *  - FAILED only when the provider definitely refused; a later attempt may run.
 *  - UNKNOWN when we cannot tell (timeout, crash, 5xx). It is never treated as
 *    success. Recovery first asks the provider (lookup), then, where the provider
 *    honours idempotency keys, replays with the same key; otherwise a person
 *    resolves it from the action queue.
 * A worker that dies mid-call leaves PROCESSING with an expired lease, which the
 * next caller recovers the same way.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Operation, OperationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface EffectReceipt {
  ref: string;
  result?: Record<string, unknown>;
}

export interface OperationSpec {
  key: string;
  kind: string;
  /** Business payload. A different payload under the same key is refused while the first may have happened. */
  payload: Record<string, unknown>;
  sellerId?: string | null;
  orderId?: string | null;
  sellerOrderId?: string | null;
  ownerRole?: string;
  leaseMs?: number;
  /** Perform the effect. Receives the idempotency key to send to the provider. */
  execute: (idempotencyKey: string) => Promise<EffectReceipt>;
  /** Ask the provider whether the effect already happened. */
  lookup?: () => Promise<EffectReceipt | null>;
  /** How long the provider honours an idempotency key (Stripe: 24 hours). */
  replayWindowMs?: number;
  /** Was this error a definite refusal (FAILED) or an unknown outcome (UNKNOWN)? */
  classify?: (e: unknown) => "FAILED" | "UNKNOWN";
}

const DEFAULT_LEASE_MS = 2 * 60_000;
/** Unresolved money problems escalate to a person after this long. */
const ESCALATE_MS = 4 * 3_600_000;

export function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload, Object.keys(payload).sort())).digest("hex");
}

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

/** Network failures, timeouts and provider 5xx: the request may or may not have happened. */
export function defaultClassify(e: unknown): "FAILED" | "UNKNOWN" {
  const err = e as { type?: string; statusCode?: number; status?: number; name?: string; code?: string } | null;
  if (!err) return "UNKNOWN";
  if (err.type === "StripeConnectionError" || err.type === "StripeAPIError") return "UNKNOWN";
  if (err.name === "TimeoutError" || err.name === "AbortError" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT") return "UNKNOWN";
  const status = err.statusCode ?? err.status;
  if (typeof status === "number") return status >= 500 ? "UNKNOWN" : "FAILED";
  if (err.type?.startsWith("Stripe")) return "FAILED";
  if (e instanceof TypeError) return "UNKNOWN"; // fetch() network failure
  return "FAILED";
}

function idempotencyKeyOf(op: Operation): string {
  return String((op.result as { idempotencyKey?: string } | null)?.idempotencyKey ?? `${op.key}:a${op.attempts}`);
}

async function finish(id: string, status: OperationStatus, data: Partial<Prisma.OperationUpdateInput>): Promise<Operation> {
  return db.operation.update({
    where: { id },
    data: { status, leaseUntil: null, escalateAt: status === "UNKNOWN" ? new Date(Date.now() + ESCALATE_MS) : status === "CONFIRMED" ? null : undefined, ...data },
  });
}

/**
 * Run (or recover) one effect. Returns the operation in its resulting state.
 * PROCESSING means another worker holds it right now.
 */
export async function runOperation(spec: OperationSpec): Promise<Operation> {
  const hash = payloadHash(spec.payload);
  await db.operation.createMany({
    data: [
      {
        key: spec.key,
        kind: spec.kind,
        payloadHash: hash,
        payload: spec.payload as Prisma.InputJsonValue,
        sellerId: spec.sellerId ?? null,
        orderId: spec.orderId ?? null,
        sellerOrderId: spec.sellerOrderId ?? null,
        ownerRole: spec.ownerRole ?? "finance",
      },
    ],
    skipDuplicates: true,
  });
  let op = await db.operation.findUniqueOrThrow({ where: { key: spec.key } });
  if (op.status === "CONFIRMED") return op;

  const now = Date.now();
  const leaseActive = op.status === "PROCESSING" && op.leaseUntil && op.leaseUntil.getTime() > now;
  if (leaseActive) return op;

  if (op.payloadHash !== hash) {
    // Only a definitely-failed effect may be retried with different terms.
    if (op.status !== "FAILED" && op.status !== "REQUESTED") {
      throw new Error(`Operation ${spec.key} is ${op.status.toLowerCase()} with different terms; resolve it before retrying.`);
    }
    op = await db.operation.update({ where: { id: op.id }, data: { payloadHash: hash, payload: spec.payload as Prisma.InputJsonValue } });
  }

  // Recovery: a crashed or uncertain attempt. Ask the provider first.
  const uncertain = op.status === "UNKNOWN" || op.status === "PROCESSING";
  let replayKey: string | null = null;
  if (uncertain) {
    if (spec.lookup) {
      try {
        const found = await spec.lookup();
        if (found) return finish(op.id, "CONFIRMED", { providerRef: found.ref, result: { ...(op.result as object), ...found.result, recoveredBy: "lookup" }, lastError: null });
      } catch (e) {
        await db.operation.update({ where: { id: op.id }, data: { lastError: `Lookup failed: ${errorText(e)}` } });
      }
    }
    const firstAttemptAt = (op.result as { attemptedAt?: string } | null)?.attemptedAt;
    const withinReplay = spec.replayWindowMs && firstAttemptAt && now - new Date(firstAttemptAt).getTime() < spec.replayWindowMs - 3_600_000;
    if (!withinReplay) {
      return op.status === "UNKNOWN" ? op : finish(op.id, "UNKNOWN", { lastError: op.lastError ?? "The worker stopped before the provider answered." });
    }
    replayKey = idempotencyKeyOf(op);
  }

  // Claim it, recording which idempotency key is about to be sent so a crash can replay it.
  const idempotencyKey = replayKey ?? `${spec.key}:a${op.attempts + 1}`;
  const attemptedAt = replayKey ? (op.result as { attemptedAt?: string }).attemptedAt : new Date().toISOString();
  const claimed = await db.operation.updateMany({
    where: { id: op.id, status: op.status, attempts: op.attempts },
    data: {
      status: "PROCESSING",
      leaseUntil: new Date(now + (spec.leaseMs ?? DEFAULT_LEASE_MS)),
      attempts: { increment: 1 },
      result: { ...((op.result as object) ?? {}), idempotencyKey, attemptedAt },
    },
  });
  if (claimed.count === 0) return db.operation.findUniqueOrThrow({ where: { id: op.id } });

  try {
    const receipt = await spec.execute(idempotencyKey);
    return finish(op.id, "CONFIRMED", {
      providerRef: receipt.ref,
      result: { idempotencyKey, attemptedAt: new Date().toISOString(), ...receipt.result },
      lastError: null,
    });
  } catch (e) {
    const verdict = (spec.classify ?? defaultClassify)(e);
    return finish(op.id, verdict, { lastError: errorText(e) });
  }
}

/** An operator records the real-world outcome of an UNKNOWN operation. */
export async function resolveOperation(input: { id: string; actorId: string; outcome: "CONFIRMED" | "FAILED"; providerRef?: string | null; note: string }): Promise<Operation> {
  const op = await db.operation.findUniqueOrThrow({ where: { id: input.id } });
  if (op.status !== "UNKNOWN" && op.status !== "PROCESSING") throw new Error("Only unresolved operations can be resolved by hand.");
  if (input.outcome === "CONFIRMED" && !input.providerRef) throw new Error("Enter the provider's reference (for example the Stripe transfer id).");
  return db.operation.update({
    where: { id: op.id },
    data: { status: input.outcome, providerRef: input.providerRef ?? op.providerRef, resolvedById: input.actorId, resolutionNote: input.note, leaseUntil: null, escalateAt: null },
  });
}

export async function unresolvedFor(where: { sellerOrderId?: string; orderId?: string }): Promise<Operation[]> {
  return db.operation.findMany({ where: { ...where, status: { in: ["PROCESSING", "UNKNOWN"] } } });
}
