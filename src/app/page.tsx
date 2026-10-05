import Link from "next/link";
import { FEES } from "@/config/fees";
import { CATEGORIES } from "@/config/catalog";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { publicListingWhere } from "@/server/listings";
import { ListingVisual } from "@/components/product/ListingVisual";
import { ProductGrid } from "@/components/product/ProductCard";
import { ButtonLink, Container, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const listingCard = {
  images: { orderBy: { position: "asc" as const }, take: 2 },
  seller: { select: { shopName: true } },
};

export default async function HomePage() {
  const [featured, heroPicks, tools, byCategory] = await Promise.all([
    db.listing.findMany({ where: publicListingWhere(), orderBy: [{ salesCount: "desc" }, { publishedAt: "desc" }], take: 6, include: listingCard }),
    db.listing.findMany({ where: { ...publicListingWhere(), kind: { not: "DIGITAL" } }, orderBy: { publishedAt: "desc" }, take: 5, include: { images: { orderBy: { position: "asc" }, take: 1 } } }),
    db.listing.groupBy({ by: ["aiTool"], where: publicListingWhere(), _count: { _all: true }, orderBy: { _count: { aiTool: "desc" } }, take: 6 }),
    Promise.all(
      ["apparel", "art", "digital"].map((c) =>
        db.listing.findFirst({ where: { ...publicListingWhere(), category: c }, orderBy: { salesCount: "desc" }, include: { images: { orderBy: { position: "asc" }, take: 1 } } }),
      ),
    ),
  ]);

  return (
    <>
      {/* Hero: Fre's inset photo band, built from real listing mockups */}
      <section className="mx-auto max-w-[1340px] px-4 pt-6 sm:px-5" aria-labelledby="hero-title">
        <div className="relative isolate overflow-hidden bg-band">
          <div aria-hidden className="absolute inset-0 grid grid-cols-3 gap-0 opacity-90 sm:grid-cols-5">
            {heroPicks.map((l, i) => (
              <div key={l.id} className={i > 2 ? "hidden sm:block" : ""}>
                <ListingVisual image={l.images[0]} productTypeId={l.productType} className="h-full w-full" />
              </div>
            ))}
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/70" />
          <div className="relative flex min-h-[460px] flex-col items-center justify-center px-5 py-20 text-center text-white sm:min-h-[600px]">
            <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.22em] text-white/80">Every product made with AI · every tool named</p>
            <h1 id="hero-title" className="max-w-3xl font-serif text-[40px] leading-[1.08] sm:text-[60px]">
              Things worth owning, made with AI and honest about it
            </h1>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/shop" variant="dark" size="lg">
                Shop the market
              </ButtonLink>
              <ButtonLink href="/sell" variant="light" size="lg">
                Start selling
              </ButtonLink>
            </div>
          </div>
        </div>

        {/* Category tiles */}
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {byCategory.map((l, i) => {
            const id = ["apparel", "art", "digital"][i];
            const label = CATEGORIES.find((c) => c.id === id)!.label;
            return (
              <li key={id}>
                <Link href={`/shop?category=${id}`} className="group relative flex h-[104px] items-end justify-end overflow-hidden bg-[#121214] px-5 pb-4 text-white">
                  {l ? (
                    <div aria-hidden className="absolute inset-y-0 left-0 w-[46%] opacity-60 transition-opacity duration-200 group-hover:opacity-90">
                      <ListingVisual image={l.images[0]} productTypeId={l.productType} className="h-full w-full" />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#121214]" />
                    </div>
                  ) : null}
                  <span className="relative font-serif text-[26px] group-hover:underline">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <Container className="mt-24">
        <SectionTitle>Featured Products</SectionTitle>
        <ProductGrid listings={featured} />
        <div className="mt-12 text-center">
          <ButtonLink href="/shop" variant="secondary">
            See everything
          </ButtonLink>
        </div>
      </Container>

      {/* "Our Brands" → the AI tools sellers used */}
      <Container className="mt-28">
        <SectionTitle sub="Every listing names the AI it was made with. Browse by tool.">Made With</SectionTitle>
        <ul className="grid grid-cols-2 gap-y-8 text-center sm:grid-cols-3 lg:grid-cols-6">
          {tools.map((t) => (
            <li key={t.aiTool}>
              <Link href={`/shop?tool=${encodeURIComponent(t.aiTool)}`} className="group block">
                <span className="block text-[15px] font-bold uppercase tracking-[0.22em] text-ink group-hover:text-signal">{t.aiTool}</span>
                <span className="mt-1 block text-[12.5px] text-muted">{t._count._all} listings</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      {/* Disclosure promise */}
      <Container className="mt-28">
        <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
          {[
            { k: "01", t: "Named tool", d: "Each product says which AI made it: Midjourney, Flux, Firefly, GPT Image, and so on." },
            { k: "02", t: "How it was made", d: "Sellers write a short note on the prompt, the edits and the process. You read it before you buy." },
            { k: "03", t: "Real production", d: "Printed by Printful, Printify or Gelato, shipped by the maker, or downloaded instantly." },
          ].map((p) => (
            <div key={p.k} className="bg-surface p-7">
              <p className="font-serif text-[15px] italic text-signal">{p.k}</p>
              <h3 className="mt-2 font-serif text-[22px]">{p.t}</h3>
              <p className="mt-2 text-[14.5px] text-muted">{p.d}</p>
            </div>
          ))}
        </div>
      </Container>

      {/* Sell CTA */}
      <Container className="mt-28">
        <div className="flex flex-col items-start justify-between gap-6 bg-band px-7 py-10 text-band-ink sm:flex-row sm:items-center sm:px-10">
          <div>
            <p className="font-serif text-[15px] italic text-band-muted">For makers</p>
            <h2 className="mt-1 font-serif text-[30px] sm:text-[36px]">
              {formatMoney(FEES.subscription.monthlyCents)} a month. {FEES.commission.rateBps / 100}% when you sell.
            </h2>
            <p className="mt-2 max-w-xl text-[14.5px] text-band-muted">
              Describe a design, pick from four AI versions, choose a print partner and publish. Card processing is passed through at cost.
            </p>
          </div>
          <ButtonLink href="/sell" variant="light" size="lg" className="shrink-0">
            Open a shop
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
