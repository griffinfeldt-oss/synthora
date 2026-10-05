import Link from "next/link";
import type { Metadata } from "next";
import { CATEGORIES, PRODUCT_TYPES, categoryLabel, productType } from "@/config/catalog";
import { parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { facetCounts, searchListings, type SearchParams } from "@/server/listings";
import { ProductGrid } from "@/components/product/ProductCard";
import { Button, EmptyState, Input, PageBand, Select, SidebarHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export default async function ShopPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const params: SearchParams = {
    q: one(sp.q),
    category: one(sp.category),
    type: one(sp.type),
    tool: one(sp.tool),
    fulfillment: one(sp.fulfillment),
    min: one(sp.min) ? parseMoneyToCents(one(sp.min)) ?? undefined : undefined,
    max: one(sp.max) ? parseMoneyToCents(one(sp.max)) ?? undefined : undefined,
    sort: (one(sp.sort) as SearchParams["sort"]) ?? "new",
    page: Number(one(sp.page) ?? 1) || 1,
  };
  const [result, facets] = await Promise.all([searchListings(params), facetCounts()]);

  const link = (patch: Partial<Record<keyof SearchParams, string | undefined>>) => {
    const q = new URLSearchParams();
    const merged = { q: params.q, category: params.category, type: params.type, tool: params.tool, fulfillment: params.fulfillment, min: one(sp.min), max: one(sp.max), sort: params.sort === "new" ? undefined : params.sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, String(v));
    const s = q.toString();
    return s ? `/shop?${s}` : "/shop";
  };

  const title = params.category ? categoryLabel(params.category) : params.tool ? `Made with ${params.tool}` : params.q ? `“${params.q}”` : "Shop";
  const activeFilters = [
    params.category && { label: categoryLabel(params.category), href: link({ category: undefined, page: undefined }) },
    params.type && { label: productType(params.type).label, href: link({ type: undefined, page: undefined }) },
    params.tool && { label: params.tool, href: link({ tool: undefined, page: undefined }) },
    params.fulfillment && { label: params.fulfillment === "digital" ? "Digital" : "Physical", href: link({ fulfillment: undefined, page: undefined }) },
    (params.min !== undefined || params.max !== undefined) && { label: `$${one(sp.min) ?? "0"}–${one(sp.max) ?? "any"}`, href: link({ min: undefined, max: undefined, page: undefined }) },
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  return (
    <>
      <div className="pt-6">
        <PageBand title={title} sub="Every item here was made with AI. The tool is named on each one." />
      </div>
      <div className="mx-auto mt-12 grid max-w-[1200px] gap-10 px-4 sm:px-5 lg:grid-cols-[240px_1fr]">
        <aside aria-label="Filters" className="space-y-10">
          <form action="/shop" className="space-y-3" role="search">
            <SidebarHeading>Search</SidebarHeading>
            <label htmlFor="q" className="sr-only">
              Search products, tools or shops
            </label>
            <div className="flex">
              <Input id="q" name="q" defaultValue={params.q} placeholder="Posters, cats, Midjourney…" className="rounded-r-none" />
              <Button type="submit" className="rounded-l-none px-4" aria-label="Search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
              </Button>
            </div>
            {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
          </form>

          <nav aria-label="Categories">
            <SidebarHeading>Categories</SidebarHeading>
            <ul className="space-y-1 text-[14px] font-medium">
              <li>
                <Link href={link({ category: undefined, page: undefined })} className={cn("block py-1", !params.category ? "font-semibold text-ink" : "text-muted hover:text-ink")} aria-current={!params.category ? "page" : undefined}>
                  All
                </Link>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c.id}>
                  <Link href={link({ category: c.id, type: undefined, page: undefined })} className={cn("block py-1", params.category === c.id ? "font-semibold text-ink" : "text-muted hover:text-ink")} aria-current={params.category === c.id ? "page" : undefined}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form action="/shop" className="space-y-5">
            <SidebarHeading>Filter</SidebarHeading>
            {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
            {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
            <div className="space-y-1.5">
              <label htmlFor="type" className="block text-[13px] font-semibold">
                Product type
              </label>
              <Select id="type" name="type" defaultValue={params.type ?? ""}>
                <option value="">Any type</option>
                {PRODUCT_TYPES.filter((p) => !params.category || p.category === params.category).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {facets.types.find((t) => t.value === p.id) ? `(${facets.types.find((t) => t.value === p.id)!.count})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tool" className="block text-[13px] font-semibold">
                AI tool
              </label>
              <Select id="tool" name="tool" defaultValue={params.tool ?? ""}>
                <option value="">Any tool</option>
                {facets.tools.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.value} ({t.count})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fulfillment" className="block text-[13px] font-semibold">
                Delivery
              </label>
              <Select id="fulfillment" name="fulfillment" defaultValue={params.fulfillment ?? ""}>
                <option value="">Physical or digital</option>
                <option value="physical">Shipped to you</option>
                <option value="digital">Instant download</option>
              </Select>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 block text-[13px] font-semibold">Price (USD)</legend>
              <div className="flex items-center gap-2">
                <label htmlFor="min" className="sr-only">
                  Minimum price
                </label>
                <Input id="min" name="min" inputMode="decimal" placeholder="Min" defaultValue={one(sp.min)} />
                <span aria-hidden className="text-muted">–</span>
                <label htmlFor="max" className="sr-only">
                  Maximum price
                </label>
                <Input id="max" name="max" inputMode="decimal" placeholder="Max" defaultValue={one(sp.max)} />
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="sort" className="block text-[13px] font-semibold">
                Sort by
              </label>
              <Select id="sort" name="sort" defaultValue={params.sort}>
                <option value="new">Newest</option>
                <option value="popular">Best selling</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Apply filters
            </Button>
          </form>
        </aside>

        <section aria-label="Results">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <p className="mr-2 text-[14px] text-muted" aria-live="polite">
              {result.total} {result.total === 1 ? "product" : "products"}
            </p>
            {activeFilters.map((f) => (
              <Link key={f.label} href={f.href} className="inline-flex items-center gap-1.5 border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] font-semibold hover:border-ink">
                {f.label}
                <span aria-hidden>×</span>
                <span className="sr-only">Remove filter</span>
              </Link>
            ))}
            {activeFilters.length ? (
              <Link href="/shop" className="text-[12.5px] font-semibold text-muted underline hover:text-ink">
                Clear all
              </Link>
            ) : null}
          </div>
          {result.items.length ? (
            <ProductGrid listings={result.items} cols={3} />
          ) : (
            <EmptyState title="Nothing matches yet" action={<Link href="/shop" className="font-semibold underline">Clear filters</Link>}>
              Try a different word or fewer filters.
            </EmptyState>
          )}
          {result.pages > 1 ? (
            <nav aria-label="Pages" className="mt-12 flex items-center justify-center gap-2">
              {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={link({ page: p === 1 ? undefined : String(p) } as never)}
                  aria-current={p === result.page ? "page" : undefined}
                  className={cn("grid size-10 place-items-center border text-[14px] font-semibold", p === result.page ? "border-ink bg-ink text-paper" : "border-line-strong bg-surface hover:border-ink")}
                >
                  {p}
                </Link>
              ))}
            </nav>
          ) : null}
        </section>
      </div>
    </>
  );
}
