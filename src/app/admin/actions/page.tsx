import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ActionForm } from "@/components/ActionForm";
import { Button, EmptyState, Field, Input, Pill, Select } from "@/components/ui";
import { clearHaltAction, resolveOperationAction, retryJobAction, runJobsAction, writeOffAction } from "../actions";

export const metadata: Metadata = { title: "Action queue · Admin" };
export const dynamic = "force-dynamic";

function age(d: Date): string {
  const h = Math.round((Date.now() - d.getTime()) / 3_600_000);
  return h < 1 ? "under an hour" : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

function Overdue({ at }: { at: Date | null }) {
  if (!at) return null;
  return at.getTime() < Date.now() ? <Pill tone="danger">overdue</Pill> : <span className="text-[12px] text-muted">escalates {formatDateTime(at)}</span>;
}

/**
 * Everything that failed or is uncertain, with who owns it. Nothing here resolves
 * itself silently: each item is retried automatically or needs a decision.
 */
export default async function ActionQueue() {
  const staleLease = new Date();
  const [ops, jobs, fulfillments, receivables, halted] = await Promise.all([
    db.operation.findMany({
      where: { OR: [{ status: "UNKNOWN" }, { status: "PROCESSING", leaseUntil: { lt: staleLease } }] },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    db.job.findMany({ where: { status: { in: ["DEAD", "FAILED"] } }, orderBy: { updatedAt: "asc" }, take: 50 }),
    db.fulfillment.findMany({ where: { status: "FAILED" }, include: { sellerOrder: { include: { order: true, seller: true } } }, orderBy: { updatedAt: "asc" }, take: 50 }),
    db.sellerReceivable.findMany({ where: { status: "OPEN" }, include: { seller: true }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.seller.findMany({ where: { payoutsHaltedAt: { not: null } } }),
  ]);
  const total = ops.length + jobs.filter((j) => j.status === "DEAD").length + fulfillments.length + receivables.length + halted.length;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-[24px]">Action queue</h2>
          <p className="text-[14px] text-muted">{total ? `${total} item(s) need a person.` : "Nothing needs a person right now."} Failed work retries on its own every few minutes first.</p>
        </div>
        <ActionForm action={runJobsAction} submitLabel="Retry everything now" pendingLabel="Running…" variant="secondary" size="sm" />
      </div>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Money and partner operations we could not confirm ({ops.length})</h3>
        <p className="text-[13.5px] text-muted">
          These may or may not have happened at Stripe or the partner. They are never treated as done. Check the provider dashboard, then record what you found. Payouts and refunds on the same order wait until this is resolved.
        </p>
        {ops.length === 0 ? <EmptyState title="None" /> : null}
        {ops.map((op) => (
          <div key={op.id} className="space-y-3 border border-line bg-surface p-4 text-[14px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {op.kind.replace("_", " ")} · <code className="text-[12.5px]">{op.key}</code>
              </p>
              <span className="flex items-center gap-2">
                <Pill tone="warn">{op.status.toLowerCase()}</Pill>
                <span className="text-[12px] text-muted">owner: {op.ownerRole} · {age(op.createdAt)} old</span>
                <Overdue at={op.escalateAt} />
              </span>
            </div>
            {op.lastError ? <p className="text-danger">{op.lastError}</p> : null}
            <pre className="overflow-x-auto bg-surface-2 p-2 text-[12px]">{JSON.stringify(op.payload, null, 1)}</pre>
            {op.orderId ? (
              <Link href={`/admin/orders/${op.orderId}`} className="text-[13px] font-semibold underline">
                Open order
              </Link>
            ) : null}
            <ActionForm action={resolveOperationAction} submitLabel="Record outcome" size="sm" variant="secondary" className="grid gap-3 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end sm:space-y-0">
              <input type="hidden" name="opId" value={op.id} />
              <Field label="It…" htmlFor={`o-${op.id}`}>
                <Select id={`o-${op.id}`} name="outcome" defaultValue="CONFIRMED">
                  <option value="CONFIRMED">happened</option>
                  <option value="FAILED">did not happen</option>
                </Select>
              </Field>
              <Field label="Provider reference" htmlFor={`r-${op.id}`}>
                <Input id={`r-${op.id}`} name="providerRef" placeholder="tr_…, re_…, order id" />
              </Field>
              <Field label="What you checked" htmlFor={`n-${op.id}`}>
                <Input id={`n-${op.id}`} name="note" required />
              </Field>
            </ActionForm>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Background jobs that failed ({jobs.length})</h3>
        {jobs.length === 0 ? <EmptyState title="None" /> : null}
        {jobs.map((j) => (
          <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 text-[14px]">
            <div className="min-w-0">
              <p className="font-semibold">
                {j.type} <Pill tone={j.status === "DEAD" ? "danger" : "warn"}>{j.status === "DEAD" ? "gave up" : `retrying (${j.attempts}/${j.maxAttempts})`}</Pill>
              </p>
              <p className="truncate text-[13px] text-danger">{j.lastError}</p>
              <p className="text-[12px] text-muted">
                owner: {j.ownerRole} · {j.status === "DEAD" ? "needs a person" : `next try ${formatDateTime(j.runAt)}`}
              </p>
            </div>
            <form action={retryJobAction}>
              <input type="hidden" name="jobId" value={j.id} />
              <Button size="sm" variant="secondary">Retry now</Button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Partner orders that failed ({fulfillments.length})</h3>
        <p className="text-[13.5px] text-muted">The seller has been asked to fix and retry, or refund. Step in if it sits here.</p>
        {fulfillments.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 text-[14px]">
            <div>
              <p className="font-semibold">
                {f.sellerOrder.order.number} · {f.sellerOrder.seller.shopName} · {f.provider}
              </p>
              <p className="text-[13px] text-danger">{f.failureReason}</p>
              <p className="text-[12px] text-muted">failed {age(f.updatedAt)} ago · owner: operations</p>
            </div>
            <Link href={`/admin/orders/${f.sellerOrder.orderId}`} className="text-[13px] font-semibold underline">
              Open order
            </Link>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Seller debts and credits ({receivables.length})</h3>
        <p className="text-[13.5px] text-muted">Recovered from (or paid with) the seller&apos;s next payouts. Write one off only after deciding not to pursue it.</p>
        {receivables.map((r) => (
          <div key={r.id} className="space-y-2 border border-line bg-surface p-4 text-[14px]">
            <p className="font-semibold">
              {r.seller.shopName}: {r.amountCents >= 0 ? "owes" : "is owed"} {formatMoney(Math.abs(r.amountCents - r.recoveredCents))}
            </p>
            <p className="text-[13px] text-muted">
              {r.reason} · {age(r.createdAt)} old
            </p>
            {r.amountCents - r.recoveredCents > 0 ? (
              <ActionForm action={writeOffAction} submitLabel="Write off" size="sm" variant="secondary" className="flex flex-wrap items-end gap-3 space-y-0">
                <input type="hidden" name="receivableId" value={r.id} />
                <Input name="note" placeholder="Why" aria-label="Reason for write-off" className="h-9 w-64" required />
              </ActionForm>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Sellers with payouts halted ({halted.length})</h3>
        {halted.map((s) => (
          <div key={s.id} className="space-y-2 border border-line bg-surface p-4 text-[14px]">
            <p className="font-semibold">{s.shopName}</p>
            <p className="text-[13px] text-muted">
              {s.payoutsHaltedReason} · since {formatDateTime(s.payoutsHaltedAt!)} ·{" "}
              <Link href="/admin/reconciliation" className="underline">
                see reconciliation
              </Link>
            </p>
            <ActionForm action={clearHaltAction} submitLabel="Resume payouts" size="sm" variant="secondary" className="flex flex-wrap items-end gap-3 space-y-0">
              <input type="hidden" name="sellerId" value={s.id} />
              <Input name="note" placeholder="How it was resolved" aria-label="Resolution note" className="h-9 w-72" required />
            </ActionForm>
          </div>
        ))}
      </section>
    </div>
  );
}
