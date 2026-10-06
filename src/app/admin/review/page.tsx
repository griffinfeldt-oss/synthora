import Link from "next/link";
import type { Metadata } from "next";
import { productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ActionForm } from "@/components/ActionForm";
import { ListingVisual } from "@/components/product/ListingVisual";
import { EmptyState, Field, Notice, Pill, Textarea } from "@/components/ui";
import type { Manifest } from "@/server/listing-checks";
import type { VersionSnapshot } from "@/server/listings";
import { reviewDecisionAction } from "../actions";

export const metadata: Metadata = { title: "Review queue · Admin" };
export const dynamic = "force-dynamic";

const SCOPES = [
  "Files open and match the description",
  "Mockups are labelled and not misleading",
  "AI disclosure is plausible for this item",
  "No obvious third-party characters, logos or trademarks",
  "Not on the prohibited items list",
  "Price, licence and delivery are clear",
];

export default async function ReviewQueue() {
  const versions = await db.listingVersion.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: { listing: { include: { seller: { select: { shopName: true, status: true } }, images: { orderBy: { position: "asc" } } } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-[24px]">Review queue</h2>
        <p className="text-[14px] text-muted">
          Every new listing and every edit to words, disclosure or files waits here. Approving records your name, what you checked and when. It is not a copyright or originality guarantee, and buyers are told so.
        </p>
      </div>
      {versions.length === 0 ? <EmptyState title="Nothing waiting for review" /> : null}
      {versions.map((v) => {
        const snap = v.snapshot as unknown as VersionSnapshot;
        const m = v.manifest as unknown as Manifest;
        const isEdit = Boolean(v.listing.approvedVersionId);
        return (
          <article key={v.id} className="space-y-4 border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {isEdit ? `Edit to a live listing · version ${v.number}` : "New listing"} · {v.listing.seller.shopName}
                  {v.listing.seller.status !== "APPROVED" ? " (shop not approved yet)" : ""}
                </p>
                <h3 className="font-serif text-[22px]">{snap.title}</h3>
                <p className="text-[13px] text-muted">
                  {productType(v.listing.productType).label} · {v.listing.kind.toLowerCase().replace("_", " ")} · {formatMoney(v.listing.priceCents)} · submitted {formatDateTime(v.createdAt)}
                </p>
              </div>
              <Link href={`/l/${v.listing.slug}`} className="text-[13px] font-semibold underline">
                Open listing page
              </Link>
            </div>
            <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {v.listing.images.slice(0, 2).map((img) => (
                  <div key={img.id} className="relative aspect-square overflow-hidden bg-surface-2">
                    <ListingVisual image={img} productTypeId={v.listing.productType} className="absolute inset-0" />
                  </div>
                ))}
              </div>
              <div className="space-y-3 text-[14px]">
                <p>{snap.description}</p>
                <p>
                  <span className="font-semibold">AI disclosure:</span> {snap.aiTool} · {snap.aiInvolvement === "FULL" ? "fully AI-made" : "AI-made, finished by the seller"}. {snap.howMade}
                </p>
                <div>
                  <p className="font-semibold">Automatic checks {m.passed ? <Pill tone="ok">passed</Pill> : <Pill tone="danger">failed</Pill>}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                    {m.files.map((f) => (
                      <li key={f.role + f.assetId}>
                        {f.role}: {f.fileName} ({(f.sizeBytes / 1024).toFixed(0)} KB{f.width ? `, ${f.width}×${f.height}px` : ""}
                        {f.vector ? ", vector" : ""}) ·{" "}
                        <a href={`/api/admin/assets/${f.assetId}`} className="underline">
                          open original
                        </a>
                      </li>
                    ))}
                    {m.print.map((p) => (
                      <li key={p.size}>
                        {p.size}: {p.dpi ? `${p.dpi} DPI` : "vector"} ({p.verdict.replace("_", " ")})
                      </li>
                    ))}
                    {m.license ? <li>Licence: {m.license.name}</li> : null}
                    <li>Platform generation recorded: {m.disclosure.generationRecorded ? "yes" : "no (seller-declared only)"}</li>
                  </ul>
                  {m.warnings.length ? <Notice tone="warn" className="mt-2">{m.warnings.join(" ")}</Notice> : null}
                </div>
              </div>
            </div>
            <ActionForm action={reviewDecisionAction} submitLabel="Save decision" pendingLabel="Saving…">
              <input type="hidden" name="versionId" value={v.id} />
              <fieldset>
                <legend className="text-[13.5px] font-semibold">What you checked</legend>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {SCOPES.map((s) => (
                    <label key={s} className="flex items-start gap-2 text-[13.5px]">
                      <input type="checkbox" name="scope" value={s} className="mt-1 accent-[var(--signal)]" />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Note to the seller (required when asking for changes)" htmlFor={`note-${v.id}`}>
                <Textarea id={`note-${v.id}`} name="note" rows={2} />
              </Field>
              <div className="flex flex-wrap gap-4 text-[14px]">
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="approve" defaultChecked className="accent-[var(--signal)]" /> Approve
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="changes" className="accent-[var(--signal)]" /> Ask for changes
                </label>
              </div>
            </ActionForm>
          </article>
        );
      })}
    </div>
  );
}
