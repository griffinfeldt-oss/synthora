import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { centsToInput, formatMoney } from "@/lib/money";
import { findProvider } from "@/fulfillment/registry";
import { requireSeller } from "@/server/session";
import { ActionForm } from "@/components/ActionForm";
import { ListingVisual } from "@/components/product/ListingVisual";
import { Button, Field, Input, Notice, Pill, Textarea } from "@/components/ui";
import { counterNoticeAction, listingStatusAction, updateListingAction } from "../../actions";

export const metadata: Metadata = { title: "Edit listing" };
export const dynamic = "force-dynamic";

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { seller } = await requireSeller();
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const listing = await db.listing.findFirst({ where: { id, sellerId: seller.id }, include: { images: { orderBy: { position: "asc" } }, variants: true, digitalAsset: true } });
  if (!listing) notFound();
  const provider = findProvider(listing.provider);
  const takedown = listing.status === "REMOVED" ? await db.takedownRequest.findFirst({ where: { listingId: listing.id }, orderBy: { createdAt: "desc" } }) : null;

  return (
    <div className="space-y-8">
      {created === "ACTIVE" ? (
        <Notice tone="ok" title="Your listing is live">
          <Link href={`/l/${listing.slug}`} className="font-semibold underline">
            See it in the shop
          </Link>
          {seller.status !== "APPROVED" ? " (visible to buyers once your shop is approved)" : ""}
        </Notice>
      ) : created === "DRAFT" ? (
        <Notice tone="warn" title="Saved as a draft">
          Publish it from here once your setup is complete.
        </Notice>
      ) : null}
      {listing.status === "SUSPENDED" || listing.status === "REMOVED" ? (
        <Notice tone="danger" title={listing.status === "REMOVED" ? "Removed" : "Suspended by Latent.Market"}>
          {listing.statusReason ?? "Policy review."}
        </Notice>
      ) : null}
      {listing.status === "PAUSED_BILLING" ? <Notice tone="warn" title="Paused: plan payment failed">Update billing on the Earnings page to bring it back.</Notice> : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="relative size-40 overflow-hidden border border-line bg-surface-2">
          <ListingVisual image={listing.images[0]} productTypeId={listing.productType} className="absolute inset-0" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-[26px]">{listing.title}</h2>
          <p className="text-[14px] text-muted">
            {productType(listing.productType).label} · {provider?.name} · {listing.variants.length} option{listing.variants.length === 1 ? "" : "s"}
            {listing.kind === "PARTNER" ? ` · partner base cost ${formatMoney(listing.baseCostCents)}` : ""}
            {listing.digitalAsset ? ` · file: ${listing.digitalAsset.fileName}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={listing.status === "ACTIVE" ? "ok" : "neutral"}>{listing.status.replace("_", " ").toLowerCase()}</Pill>
            <span className="text-[13px] text-muted">{listing.salesCount} sold</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {listing.status === "ACTIVE" ? (
              <form action={listingStatusAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="action" value="pause" />
                <Button size="sm" variant="secondary">Pause</Button>
              </form>
            ) : ["PAUSED", "DRAFT"].includes(listing.status) ? (
              <form action={listingStatusAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="action" value="activate" />
                <Button size="sm">Publish</Button>
              </form>
            ) : null}
            <Link href={`/l/${listing.slug}`} className="inline-flex h-9 items-center px-2 text-[13px] font-semibold underline">
              View listing
            </Link>
            <form action={listingStatusAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="action" value="delete" />
              <Button size="sm" variant="ghost" className="text-danger">
                Delete
              </Button>
            </form>
          </div>
        </div>
      </div>

      {listing.status !== "REMOVED" && listing.status !== "SUSPENDED" ? (
        <ActionForm action={updateListingAction} submitLabel="Save changes" className="max-w-2xl">
          <input type="hidden" name="listingId" value={listing.id} />
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" defaultValue={listing.title} maxLength={80} required />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={listing.description} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (USD)" htmlFor="price">
              <Input id="price" name="price" inputMode="decimal" defaultValue={centsToInput(listing.priceCents)} required />
            </Field>
            <Field label="AI tool" htmlFor="aiTool">
              <Input id="aiTool" name="aiTool" defaultValue={listing.aiTool} required />
            </Field>
            {listing.kind === "SELF_SHIP" ? (
              <>
                <Field label="Shipping per order" htmlFor="shipping">
                  <Input id="shipping" name="shipping" inputMode="decimal" defaultValue={centsToInput(listing.shippingCents ?? 0)} />
                </Field>
                <Field label="In stock" htmlFor="inventory">
                  <Input id="inventory" name="inventory" inputMode="numeric" defaultValue={listing.inventory ?? ""} />
                </Field>
              </>
            ) : null}
          </div>
          <Field label="How it was made" htmlFor="howMade">
            <Textarea id="howMade" name="howMade" defaultValue={listing.howMade} required />
          </Field>
          <Field label="Tags" htmlFor="tags" hint="Comma separated.">
            <Input id="tags" name="tags" defaultValue={listing.tags.join(", ")} />
          </Field>
        </ActionForm>
      ) : null}

      {takedown?.status === "LISTING_REMOVED" ? (
        <section className="max-w-2xl border border-line bg-surface p-5">
          <h3 className="font-serif text-[20px]">File a counter-notice</h3>
          <p className="mt-1 text-[14px] text-muted">
            Removed after a notice from {takedown.rightsOwner}. If you believe you have the rights to sell this, explain why. We may share your statement with the claimant.
          </p>
          <ActionForm action={counterNoticeAction} submitLabel="Send counter-notice" className="mt-4">
            <input type="hidden" name="listingId" value={listing.id} />
            <Textarea name="statement" aria-label="Counter-notice statement" required minLength={40} />
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
