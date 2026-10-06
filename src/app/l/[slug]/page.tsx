import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categoryLabel, productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { findProvider } from "@/fulfillment/registry";
import { currentUser, isAdmin } from "@/server/session";
import { publicListingWhere } from "@/server/listings";
import { requestContext, track } from "@/server/analytics";
import type { Manifest } from "@/server/listing-checks";
import { ListingVisual } from "@/components/product/ListingVisual";
import { ProductGrid } from "@/components/product/ProductCard";
import { AddToCart, Gallery, ReportButton } from "@/components/product/ListingInteractive";
import { AiChip, Container, Notice, PageBand, SectionTitle, Stars } from "@/components/ui";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  return db.listing.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
      seller: true,
      licenseVersion: true,
      designAsset: { select: { generationId: true, sha256: true } },
      deliverableAsset: { select: { fileName: true, contentType: true, sizeBytes: true, width: true, height: true } },
      approvedVersion: {
        include: { decisions: { where: { outcome: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: { select: { name: true } } } } },
      },
      reviews: { where: { status: "VISIBLE" }, orderBy: { createdAt: "desc" }, take: 20, include: { buyer: { select: { name: true } } } },
    },
  });
}

function fileSummary(f: { contentType: string; sizeBytes: number; width: number | null; height: number | null; fileName: string }): string {
  const ext = f.fileName.split(".").pop()?.toUpperCase() ?? "file";
  const mb = f.sizeBytes / 1_048_576;
  return `${ext} · ${mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(f.sizeBytes / 1024))} KB`}${f.width && f.contentType !== "image/svg+xml" ? ` · ${f.width}×${f.height} px` : f.contentType === "image/svg+xml" ? " · vector, any size" : ""}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const listing = await load((await params).slug);
  if (!listing) return { title: "Not found" };
  return { title: listing.title, description: `${listing.description.slice(0, 150)} Made with ${listing.aiTool}.` };
}

export default async function ListingPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [listing, user] = await Promise.all([load(slug), currentUser()]);
  if (!listing) notFound();

  const isOwner = user?.seller?.id === listing.sellerId;
  const visible = listing.status === "ACTIVE" && Boolean(listing.approvedVersionId) && listing.seller.status === "APPROVED";
  if (!visible && !isOwner && !isAdmin(user)) notFound();

  const ctx = await requestContext(user);
  await track({ name: "product_viewed", listingId: listing.id, listingVersionId: listing.approvedVersionId, ...ctx, isInternal: ctx.isInternal || isOwner });

  // Evidence, kept separate: what the creator says, what Synthora recorded, what was checked, who reviewed.
  const version = listing.approvedVersion;
  const manifest = (version?.manifest ?? null) as Manifest | null;
  const generation = listing.generationId && listing.designAsset?.generationId === listing.generationId
    ? await db.generation.findUnique({ where: { id: listing.generationId }, select: { model: true, createdAt: true, sellerId: true } })
    : null;
  const generationRecorded = Boolean(generation && generation.sellerId === listing.sellerId && version?.designSha256 && version.designSha256 === listing.designAsset?.sha256);
  const review = version?.decisions[0] ?? null;

  const def = productType(listing.productType);
  const provider = findProvider(listing.provider);
  const more = await db.listing.findMany({
    where: { ...publicListingWhere(), sellerId: listing.sellerId, id: { not: listing.id } },
    take: 3,
    orderBy: { salesCount: "desc" },
    include: { images: { orderBy: { position: "asc" }, take: 2 }, seller: { select: { shopName: true } } },
  });

  const delivery =
    listing.kind === "DIGITAL"
      ? { title: "Digital file: nothing ships", body: "You download the file from your order page as soon as your payment is confirmed. No frame, print or physical item is included." }
      : listing.kind === "SELF_SHIP"
        ? { title: `Ships from ${listing.seller.location ?? "the seller"}`, body: `The seller packs and posts it within ${listing.processingDays} business days and adds tracking. ${listing.shippingCents ? `Shipping ${formatMoney(listing.shippingCents)} per order.` : "Free shipping."}` }
        : { title: `Made to order by ${provider?.name ?? "a print partner"}`, body: `Printed after you order, usually ships in ${listing.processingDays}–${listing.processingDays + 4} business days. Shipping is calculated at checkout from the partner's live rates.` };

  return (
    <>
      <div className="pt-6">
        <PageBand title={listing.title} />
      </div>
      <Container className="mt-12">
        {!visible ? (
          <Notice tone="warn" title="This listing is not public" className="mb-8">
            Status: {listing.status.replace("_", " ").toLowerCase()}
            {listing.seller.status !== "APPROVED" ? " · shop awaiting approval" : ""}. Only you{isAdmin(user) ? " and admins" : ""} can see this page.
          </Notice>
        ) : null}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
          <Gallery
            main={listing.images.map((img, i) => (
              <ListingVisual key={img.id} image={img} productTypeId={listing.productType} variant={i} detail labelled className="absolute inset-0" />
            ))}
            thumbs={listing.images.map((img, i) => (
              <ListingVisual key={img.id} image={img} productTypeId={listing.productType} variant={i} className="h-full w-full" />
            ))}
          />

          <div>
            <p className="text-[13px] font-semibold text-muted">
              <Link href={`/shop?category=${listing.category}`} className="hover:text-ink hover:underline">
                {categoryLabel(listing.category)}
              </Link>{" "}
              · {def.label}
            </p>
            <h2 className="mt-2 font-serif text-[32px] leading-tight sm:text-[36px]">{listing.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="font-serif text-[26px] text-muted">{formatMoney(listing.priceCents)}</p>
              {listing.ratingCount > 0 ? (
                <a href="#reviews">
                  <Stars value={listing.ratingAvg} count={listing.ratingCount} />
                </a>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <AiChip tool={listing.aiTool} />
              <span className="text-[12.5px] font-semibold text-muted">
                {listing.aiInvolvement === "FULL" ? "Fully AI-made" : "AI-made, finished by the seller"}
              </span>
            </div>

            {listing.kind === "DIGITAL" ? (
              <div className="mt-5 border-l-4 border-signal bg-surface px-4 py-3 text-[14px]">
                <p className="font-semibold">Digital download. Nothing is shipped.</p>
                {listing.deliverableAsset ? <p className="text-muted">You get: {fileSummary(listing.deliverableAsset)}</p> : null}
                {manifest?.sharpUpToInches ? (
                  <p className="text-muted">
                    Prints sharply up to {manifest.sharpUpToInches.w} × {manifest.sharpUpToInches.h} in (300 DPI).
                  </p>
                ) : null}
                {listing.licenseVersion ? (
                  <p className="text-muted">
                    Licence: {listing.licenseVersion.name}. {listing.licenseVersion.summary}{" "}
                    <Link href={`/legal/licenses/${listing.licenseVersion.id}`} className="underline">
                      Read it
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="mt-6 leading-relaxed text-muted">{listing.description}</p>

            <div className="mt-8">
              <AddToCart
                listingId={listing.id}
                title={listing.title}
                priceCents={listing.priceCents}
                variants={listing.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents }))}
                digital={listing.kind === "DIGITAL"}
                maxQuantity={listing.kind === "SELF_SHIP" ? listing.inventory : null}
              />
              {listing.kind === "SELF_SHIP" && listing.inventory !== null && listing.inventory > 0 && listing.inventory <= 5 ? (
                <p className="mt-3 text-[13px] font-semibold text-warn">Only {listing.inventory} left</p>
              ) : null}
            </div>

            <section aria-labelledby="how-made" className="mt-10 border border-line bg-surface p-5">
              <h3 id="how-made" className="flex items-center gap-2 font-serif text-[20px]">
                <span aria-hidden className="size-2 bg-signal" />
                How it was made
              </h3>
              <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">The seller says</p>
              <p className="mt-1 text-[14.5px] leading-relaxed">{listing.howMade}</p>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
                <dt className="text-muted">AI tool</dt>
                <dd className="font-semibold">{listing.aiTool}</dd>
                <dt className="text-muted">AI involvement</dt>
                <dd>{listing.aiInvolvement === "FULL" ? "Fully AI-made" : "AI-made, then edited or finished by hand"}</dd>
                {listing.prompt ? (
                  <>
                    <dt className="text-muted">Prompt</dt>
                    <dd className="font-serif italic">“{listing.prompt}”</dd>
                  </>
                ) : null}
                <dt className="text-muted">Listed</dt>
                <dd>{formatDate(listing.publishedAt ?? listing.createdAt)}</dd>
              </dl>
              <ul className="mt-4 space-y-2 border-t border-line pt-4 text-[13.5px]" aria-label="What Synthora checked">
                {generationRecorded && generation ? (
                  <li>
                    <span className="font-semibold">Recorded by Synthora:</span> made in Synthora&apos;s studio with {generation.model} on {formatDate(generation.createdAt)}. The file sold is the one that was generated.
                  </li>
                ) : (
                  <li className="text-muted">The AI use above is the seller&apos;s own statement; Synthora did not record the generation.</li>
                )}
                {version?.checksPassed && manifest ? (
                  <li>
                    <span className="font-semibold">Files checked</span> on {formatDate(new Date(manifest.checkedAt))}: the files open, match what is listed{manifest.print.length ? ", and have enough resolution for the sizes offered" : ""}.
                  </li>
                ) : null}
                {review ? (
                  <li>
                    <span className="font-semibold">Reviewed by {review.reviewer.name?.split(" ")[0] ?? "a Synthora reviewer"}</span> on {formatDate(review.createdAt)}: {review.scope.toLowerCase()}. A review is not a guarantee that the design is original.
                  </li>
                ) : null}
              </ul>
            </section>

            <section aria-labelledby="delivery" className="mt-4 border border-line bg-surface p-5">
              <h3 id="delivery" className="font-serif text-[20px]">
                {delivery.title}
              </h3>
              <p className="mt-1.5 text-[14.5px] text-muted">{delivery.body}</p>
              <p className="mt-3 text-[13px] text-muted">
                <Link href="/legal/returns" className="underline hover:text-ink">
                  Returns &amp; problems
                </Link>{" "}
                · The seller is paid only after {listing.kind === "DIGITAL" ? "a short hold" : "delivery"}, so problems can be put right.
              </p>
            </section>

            <div className="mt-4 flex items-center justify-between gap-4 border border-line bg-surface p-5">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Sold by</p>
                <Link href={`/s/${listing.seller.slug}`} className="font-serif text-[20px] hover:underline">
                  {listing.seller.shopName}
                </Link>
                {listing.seller.location ? <p className="text-[13px] text-muted">{listing.seller.location}</p> : null}
              </div>
              <Link href={`/s/${listing.seller.slug}`} className="text-[13px] font-semibold underline">
                Visit shop
              </Link>
            </div>

            <div className="mt-6">
              <ReportButton listingId={listing.id} signedIn={Boolean(user)} />
            </div>
          </div>
        </div>

        <section id="reviews" aria-labelledby="reviews-title" className="mt-24">
          <SectionTitle>
            <span id="reviews-title">Reviews</span>
          </SectionTitle>
          {listing.reviews.length ? (
            <ul className="mx-auto grid max-w-3xl gap-4">
              {listing.reviews.map((r) => (
                <li key={r.id} className="border border-line bg-surface p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Stars value={r.rating} />
                    <span className="text-[12.5px] text-muted">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="mt-2 leading-relaxed">{r.body}</p>
                  <p className="mt-2 text-[13px] font-semibold text-muted">
                    {r.buyer.name?.split(" ")[0] ?? "Buyer"} · Verified purchase
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted">No reviews yet. Buyers can review once their order is delivered.</p>
          )}
        </section>

        {more.length ? (
          <section className="mt-24" aria-labelledby="more-title">
            <SectionTitle>
              <span id="more-title">More from {listing.seller.shopName}</span>
            </SectionTitle>
            <ProductGrid listings={more} />
          </section>
        ) : null}
      </Container>
    </>
  );
}
