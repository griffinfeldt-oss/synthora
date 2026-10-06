import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState, Pill, Table } from "@/components/ui";
import type { Difference } from "@/server/reconcile";
import { runReconciliationAction } from "../actions";

export const metadata: Metadata = { title: "Reconciliation · Admin" };
export const dynamic = "force-dynamic";

export default async function Reconciliation() {
  const runs = await db.reconciliationRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  const latest = runs[0];
  const diffs = (latest?.differences ?? []) as unknown as Difference[];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-[24px]">Reconciliation</h2>
          <p className="max-w-2xl text-[14px] text-muted">
            Runs daily before payouts. Compares every paid order in the last 35 days with the ledger and with Stripe (charges, refunds, fees and transfers). Any difference halts that seller&apos;s payouts until someone clears it in the action queue.
          </p>
        </div>
        <ActionForm action={runReconciliationAction} submitLabel="Run now" pendingLabel="Checking…" variant="secondary" size="sm" />
      </div>
      {latest ? (
        <section className="space-y-3">
          <h3 className="font-serif text-[20px]">
            Latest run{" "}
            <Pill tone={latest.status === "OK" ? "ok" : latest.status === "RUNNING" ? "neutral" : "danger"}>{latest.status.toLowerCase()}</Pill>
          </h3>
          <p className="text-[13.5px] text-muted">
            {formatDateTime(latest.startedAt)} · {latest.checked} orders checked · {latest.haltedSellerIds.length} seller(s) halted
            {latest.error ? ` · error: ${latest.error}` : ""}
          </p>
          {diffs.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Difference</th>
                  <th>Expected</th>
                  <th>Found</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <span className="font-semibold">{d.kind.replace(/_/g, " ")}</span>
                      <span className="block text-[13px] text-muted">{d.detail}</span>
                    </td>
                    <td>{d.expected ?? "–"}</td>
                    <td>{d.actual ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-[14px]">No differences.</p>
          )}
        </section>
      ) : (
        <EmptyState title="No runs yet" />
      )}
      {runs.length > 1 ? (
        <section>
          <h3 className="mb-2 font-serif text-[20px]">Earlier runs</h3>
          <ul className="space-y-1 text-[13.5px]">
            {runs.slice(1).map((r) => (
              <li key={r.id}>
                {formatDateTime(r.startedAt)}: {r.status.toLowerCase()}, {r.checked} checked, {(r.differences as unknown[]).length} difference(s)
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
