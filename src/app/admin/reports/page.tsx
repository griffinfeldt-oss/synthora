import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Button, EmptyState, Input, Pill } from "@/components/ui";
import { resolveReportAction, takedownAction } from "../actions";

export const metadata: Metadata = { title: "Reports · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminReports() {
  const [reports, takedowns] = await Promise.all([
    db.report.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { listing: { select: { id: true, title: true, slug: true, status: true, aiTool: true, howMade: true } }, reporter: { select: { email: true } } } }),
    db.takedownRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { listing: { select: { title: true, slug: true, status: true } } } }),
  ]);
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h2 className="font-serif text-[24px]">Listing reports</h2>
        {reports.length === 0 ? <EmptyState title="No reports" /> : null}
        {reports.map((r) => (
          <article key={r.id} className="border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  <Link href={`/l/${r.listing.slug}`} className="underline">
                    {r.listing.title}
                  </Link>{" "}
                  <span className="text-[12.5px] font-normal text-muted">({r.listing.status.toLowerCase()})</span>
                </p>
                <p className="text-[12.5px] text-muted">
                  {r.reason.replaceAll("_", " ").toLowerCase()} · {r.reporter?.email ?? r.email ?? "anonymous"} · {formatDateTime(r.createdAt)}
                </p>
              </div>
              <Pill tone={r.status === "OPEN" ? "warn" : "neutral"}>{r.status.toLowerCase()}</Pill>
            </div>
            <p className="mt-3 text-[14px]">{r.details}</p>
            <p className="mt-2 text-[12.5px] text-muted">
              Seller&apos;s disclosure: {r.listing.aiTool} — {r.listing.howMade}
            </p>
            {r.status === "OPEN" ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={resolveReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="listingId" value={r.listing.id} />
                  <input type="hidden" name="reason" value={r.reason} />
                  <input type="hidden" name="outcome" value="ACTIONED" />
                  <input type="hidden" name="suspend" value="1" />
                  <Button size="sm" variant="danger">
                    Suspend listing
                  </Button>
                </form>
                <form action={resolveReportAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="listingId" value={r.listing.id} />
                  <Input name="note" placeholder="Internal note" aria-label="Note" className="h-9 w-60 text-[13px]" />
                  <Button size="sm" variant="secondary" name="outcome" value="ACTIONED">
                    Mark actioned
                  </Button>
                  <Button size="sm" variant="ghost" name="outcome" value="DISMISSED">
                    Dismiss
                  </Button>
                </form>
              </div>
            ) : r.adminNote ? (
              <p className="mt-3 text-[12.5px] text-muted">Note: {r.adminNote}</p>
            ) : null}
          </article>
        ))}
      </section>

      <section id="ip" className="space-y-4">
        <h2 className="font-serif text-[24px]">IP / copyright notices</h2>
        {takedowns.length === 0 ? <EmptyState title="No notices" /> : null}
        {takedowns.map((t) => (
          <article key={t.id} className="border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {t.listing ? (
                    <Link href={`/l/${t.listing.slug}`} className="underline">
                      {t.listing.title}
                    </Link>
                  ) : (
                    t.listingUrl
                  )}
                </p>
                <p className="text-[12.5px] text-muted">
                  From {t.claimantName} &lt;{t.claimantEmail}&gt; for {t.rightsOwner} · {formatDateTime(t.createdAt)} · ref {t.id}
                </p>
              </div>
              <Pill tone={t.status === "RECEIVED" || t.status === "COUNTER_NOTICE" ? "warn" : "neutral"}>{t.status.replaceAll("_", " ").toLowerCase()}</Pill>
            </div>
            <dl className="mt-3 grid gap-2 text-[14px] sm:grid-cols-2">
              <div>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Original work</dt>
                <dd>{t.workDescription}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Claim</dt>
                <dd>{t.infringementNote}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Sworn statements</dt>
                <dd>
                  Good faith: {t.goodFaith ? "yes" : "no"} · Accurate under penalty of perjury: {t.accurate ? "yes" : "no"} · Signed “{t.signature}”
                </dd>
              </div>
              {t.counterNotice ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Seller counter-notice</dt>
                  <dd>{t.counterNotice}</dd>
                </div>
              ) : null}
            </dl>
            <form action={takedownAction} className="mt-4 flex flex-wrap items-center gap-2">
              <input type="hidden" name="takedownId" value={t.id} />
              <Input name="note" placeholder="Note to claimant" aria-label="Note" className="h-9 w-60 text-[13px]" />
              {t.status === "RECEIVED" ? (
                <>
                  <Button size="sm" variant="danger" name="action" value="remove" disabled={!t.listing}>
                    Remove listing
                  </Button>
                  <Button size="sm" variant="secondary" name="action" value="reject">
                    Reject notice
                  </Button>
                </>
              ) : t.status === "COUNTER_NOTICE" ? (
                <Button size="sm" variant="secondary" name="action" value="restore">
                  Restore listing (after waiting period)
                </Button>
              ) : null}
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
