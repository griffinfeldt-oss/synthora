"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { CatalogProduct } from "@/fulfillment/types";
import { PRODUCT_TYPES, productType, type ProductTypeDef } from "@/config/catalog";
import { FEES } from "@/config/fees";
import { breakEvenPrice } from "@/lib/fees";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProductMockup } from "@/components/mockup/ProductMockup";
import { EarningsBreakdown } from "@/components/EarningsBreakdown";
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { catalogAction, copyAction, createListingAction, generateAction, mockupsAction } from "../actions";

export interface WizardProvider {
  id: string;
  name: string;
  kind: "pod" | "self" | "digital";
  productTypes: string[];
  mock: boolean;
  mockups: boolean;
}

const STYLES = ["Retro poster", "Line art", "Watercolor", "Bold & graphic", "Minimal", "Vintage badge", "Cute", "Botanical"];
const STEPS = ["Product", "Describe", "Mockup", "Details", "Price & publish"];

export function AiWizard({ providers, sampleDesign, canPublish, missing }: { providers: WizardProvider[]; sampleDesign: string; canPublish: boolean; missing: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const types = useMemo(() => PRODUCT_TYPES.filter((t) => providers.some((p) => p.productTypes.includes(t.id))), [providers]);
  const [typeId, setTypeId] = useState<string>(types[0]?.id ?? "tshirt");
  const typeDef: ProductTypeDef = productType(typeId);
  const typeProviders = providers.filter((p) => p.productTypes.includes(typeId));
  const [providerId, setProviderId] = useState<string>(typeProviders[0]?.id ?? "");
  const provider = providers.find((p) => p.id === providerId);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const product = catalog?.find((c) => c.productType === typeId) ?? null;
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [color, setColor] = useState<string>(typeDef.colors[0]);

  // Step 2
  const [prompt, setPrompt] = useState("");
  const [designs, setDesigns] = useState<Array<{ assetId: string; previewUrl: string; seed: number; width: number | null; height: number | null }>>([]);
  const [model, setModel] = useState("");
  const [demoModel, setDemoModel] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  // The chosen design: its private original's id, and the public preview to show.
  const [designId, setDesignId] = useState<string | null>(null);
  const design = designs.find((d) => d.assetId === designId)?.previewUrl ?? null;

  // Step 3
  const [partnerShots, setPartnerShots] = useState<string[] | null>(null);
  const [extraColor, setExtraColor] = useState<string | null>(null);

  // Step 4
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [howMade, setHowMade] = useState("");
  const [aiTool, setAiTool] = useState("");
  const [involvement, setInvolvement] = useState<"FULL" | "ASSISTED">("FULL");
  const [writer, setWriter] = useState("");
  const [license, setLicense] = useState<"personal" | "small-business">("personal");

  // Step 5
  const [price, setPrice] = useState("");
  const [shipping, setShipping] = useState("5.00");
  const [rights, setRights] = useState(false);

  const baseCost = useMemo(() => {
    if (!product) return 0;
    const chosen = product.variants.filter((v) => variantIds.includes(v.id));
    return Math.max(0, ...(chosen.length ? chosen : product.variants).map((v) => v.baseCostCents));
  }, [product, variantIds]);
  const shippingCents = provider?.kind === "pod" ? product?.typicalShippingCents ?? 0 : provider?.kind === "self" ? parseMoneyToCents(shipping) ?? 0 : 0;
  const priceCents = parseMoneyToCents(price) ?? 0;

  const pickType = (id: string) => {
    setTypeId(id);
    setColor(productType(id).colors[0]);
    const first = providers.find((p) => p.productTypes.includes(id));
    if (first && first.id !== providerId) {
      setProviderId(first.id);
      setCatalog(null);
    }
    setVariantIds([]);
  };

  const loadCatalog = () =>
    start(async () => {
      setError(null);
      const res = await catalogAction(providerId);
      if ("error" in res) setError(res.error);
      else {
        setCatalog(res);
        const p = res.find((c) => c.productType === typeId);
        setVariantIds(p ? p.variants.slice(0, Math.min(5, p.variants.length)).map((v) => v.id) : []);
      }
    });

  const generate = () =>
    start(async () => {
      setError(null);
      const res = await generateAction({ prompt, productType: typeId });
      if ("error" in res) setError(res.error ?? "Generation failed");
      else {
        setDesigns(res.images);
        setModel(res.model);
        setDemoModel(res.demoModel);
        setGenerationId(res.generationId);
        setDesignId(res.images[0]?.assetId ?? null);
        setPartnerShots(null);
        setTitle("");
      }
    });

  const toMockup = () =>
    start(async () => {
      setError(null);
      setStep(2);
      if (provider?.kind === "pod" && provider.mockups && !provider.mock && product && designId) {
        const shots = await mockupsAction({ providerId, partnerProductId: product.id, variantIds, designAssetId: designId });
        setPartnerShots(shots);
      }
    });

  const toDetails = () =>
    start(async () => {
      setError(null);
      setStep(3);
      if (!title) {
        const tool = aiTool || model;
        const copy = await copyAction({ prompt, productType: typeId, aiTool: tool, providerId });
        setTitle(copy.title);
        setDescription(copy.description);
        setTags(copy.tags.join(", "));
        setHowMade(copy.howMade);
        setAiTool(tool);
        setWriter(copy.writer);
        if (!price) {
          const suggested =
            provider?.kind === "digital"
              ? 900
              : provider?.kind === "self"
                ? 1600
                : Math.max(breakEvenPrice({ baseCostCents: baseCost, shippingCents, partnerBillsShipping: true, minProfitCents: Math.round(baseCost * 0.8) }), 500);
          setPrice(centsToInput(Math.ceil(suggested / 100) * 100 - 1));
        }
      }
    });

  const publish = (asDraft: boolean) =>
    start(async () => {
      setError(null);
      if (!designId) return setError("Pick a design first.");
      const mock = (c: string) => ({ kind: "MOCKUP_RENDER" as const, color: c, alt: `${title}, ${typeDef.label.toLowerCase()} (mockup)` });
      const images = [
        ...(partnerShots ?? []).map((url) => ({ kind: "MOCKUP_PARTNER" as const, url, alt: `${title}, product mockup` })),
        mock(color),
        ...(extraColor && extraColor !== color ? [mock(extraColor)] : []),
        { kind: "DESIGN" as const, alt: `${title} artwork preview` },
      ];
      const digital = provider?.kind === "digital";
      const res = await createListingAction({
        title,
        description,
        priceCents,
        productType: typeId,
        kind: provider?.kind === "pod" ? "PARTNER" : provider?.kind === "self" ? "SELF_SHIP" : "DIGITAL",
        provider: providerId,
        partnerProductId: product?.id ?? null,
        partnerVariantIds: variantIds,
        baseCostCents: provider?.kind === "pod" ? baseCost : 0,
        shippingCents: provider?.kind === "self" ? shippingCents : null,
        processingDays: provider?.kind === "self" ? 5 : 3,
        inventory: null,
        aiTool,
        aiInvolvement: involvement,
        howMade,
        prompt,
        generationId,
        designAssetId: designId,
        // A digital listing from the studio sells the design's private original.
        deliverableAssetId: digital ? designId : null,
        licenseKey: license,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        images,
        rightsConfirmed: rights,
        publish: !asDraft,
      });
      if (!res.ok) setError(res.error);
      else router.push(`/seller/listings/${res.id}?created=${res.status}`);
    });

  if (!providers.length) {
    return (
      <Notice tone="warn" title="Connect a partner first">
        Link Printify, Printful or Gelato, or turn on self-ship or digital, then come back. <a href="/seller/partners" className="font-semibold underline">Fulfillment partners</a>
      </Notice>
    );
  }

  return (
    <div className="space-y-8">
      <ol className="grid grid-cols-5 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <span className={cn("mb-1.5 block h-1", i <= step ? "bg-signal" : "bg-line")} />
            <span className={cn("hidden text-[12.5px] font-semibold sm:block", i === step ? "text-ink" : "text-muted")}>
              {i + 1}. {s}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] font-semibold text-muted sm:hidden">
        Step {step + 1} of 5 · {STEPS[step]}
      </p>

      {error ? (
        <Notice tone="danger" title="Something went wrong">
          {error}
        </Notice>
      ) : null}

      {/* ── Step 1: product & partner ── */}
      {step === 0 ? (
        <section className="space-y-6" aria-labelledby="s1">
          <h2 id="s1" className="font-serif text-[24px]">
            What should it be printed on?
          </h2>
          <div role="radiogroup" aria-label="Product type" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={typeId === t.id}
                onClick={() => pickType(t.id)}
                className={cn("border bg-surface p-2 text-left", typeId === t.id ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong")}
              >
                <div className="aspect-square overflow-hidden">
                  <ProductMockup shape={t.shape} designUrl={sampleDesign} color={t.colors[0]} alt="" className="h-full w-full" />
                </div>
                <span className="mt-2 block px-1 text-[14px] font-semibold">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Made by" htmlFor="provider">
              <Select
                id="provider"
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  setCatalog(null);
                }}
              >
                {typeProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.mock ? " (demo connection)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {catalog === null ? (
            <Button onClick={loadCatalog} disabled={pending || !providerId}>
              {pending ? "Loading options…" : "Next: choose options"}
            </Button>
          ) : product ? (
            <div className="space-y-5 border border-line bg-surface p-5">
              <div>
                <p className="font-semibold">{product.name}</p>
                <p className="text-[13.5px] text-muted">
                  {provider?.kind === "pod" ? `Base cost from ${formatMoney(product.baseCostCents)} · typical shipping ${formatMoney(product.typicalShippingCents)}` : provider?.kind === "self" ? "You make and ship it." : "Buyers download the file."}
                </p>
              </div>
              {product.variants.length > 1 ? (
                <fieldset>
                  <legend className="text-[13px] font-semibold">Sizes / options to offer</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {product.variants.map((v) => {
                      const on = variantIds.includes(v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setVariantIds((ids) => (on ? ids.filter((x) => x !== v.id) : [...ids, v.id]))}
                          className={cn("border px-3 py-1.5 text-[13px] font-semibold", on ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink")}
                        >
                          {v.name} <span className="font-normal opacity-75">{formatMoney(v.baseCostCents)}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
              {typeDef.colors.length > 1 ? (
                <fieldset>
                  <legend className="text-[13px] font-semibold">Colour for the main photo</legend>
                  <div className="mt-2 flex gap-2">
                    {typeDef.colors.map((c) => (
                      <button key={c} type="button" aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn("size-9 border-2", color === c ? "border-signal" : "border-line")} style={{ background: c }} />
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <Button onClick={() => setStep(1)} disabled={product.variants.length > 1 && variantIds.length === 0}>
                Next: describe the design
              </Button>
            </div>
          ) : (
            <Notice tone="warn">This partner does not offer that product. Choose another partner or product.</Notice>
          )}
        </section>
      ) : null}

      {/* ── Step 2: describe & generate ── */}
      {step === 1 ? (
        <section className="space-y-6" aria-labelledby="s2">
          <h2 id="s2" className="font-serif text-[24px]">
            Describe the design in plain words
          </h2>
          <Field label="Your idea" htmlFor="prompt" hint='Example: "a fox curled up asleep under the moon, retro poster colours". Put words you want printed in quotes.'>
            <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={600} placeholder="What should it look like?" />
          </Field>
          <div className="flex flex-wrap gap-2" aria-label="Style ideas">
            {STYLES.map((s) => (
              <button key={s} type="button" onClick={() => setPrompt((p) => (p.toLowerCase().includes(s.toLowerCase()) ? p : `${p.trim()}${p.trim() ? ", " : ""}${s.toLowerCase()}`))} className="border border-line-strong px-3 py-1 text-[13px] font-medium hover:border-ink">
                + {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={generate} disabled={pending || prompt.trim().length < 3}>
              {pending ? "Making 4 versions…" : designs.length ? "Make 4 new versions" : "Make 4 versions"}
            </Button>
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
          </div>
          {designs.length ? (
            <div className="space-y-4">
              <p className="text-[13.5px] text-muted">
                Made with {model}
                {demoModel ? " (procedural demo art, not an AI model)" : ""}. Pick one. These are previews; the full-size file stays private until someone buys it.
              </p>
              <div role="radiogroup" aria-label="Designs" className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {designs.map((d, i) => (
                  <button key={d.assetId} type="button" role="radio" aria-checked={designId === d.assetId} aria-label={`Version ${i + 1}`} onClick={() => setDesignId(d.assetId)} className={cn("aspect-square border-2 bg-[var(--mock-2)] p-2", designId === d.assetId ? "border-signal" : "border-transparent hover:border-line-strong")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.previewUrl} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
              <Button onClick={toMockup} disabled={!design || pending}>
                Next: see it on the {typeDef.label.toLowerCase()}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── Step 3: mockup ── */}
      {step === 2 && design ? (
        <section className="space-y-6" aria-labelledby="s3">
          <h2 id="s3" className="font-serif text-[24px]">
            Here&apos;s how it looks
          </h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="aspect-square overflow-hidden border border-line">
              <ProductMockup shape={typeDef.shape} designUrl={design} color={color} alt={`Mockup on ${typeDef.label}`} detail className="h-full w-full" />
            </div>
            <div className="space-y-5">
              {typeDef.colors.length > 1 ? (
                <fieldset>
                  <legend className="text-[13px] font-semibold">Main colour</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {typeDef.colors.map((c) => (
                      <button key={c} type="button" aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn("size-9 border-2", color === c ? "border-signal" : "border-line")} style={{ background: c }} />
                    ))}
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={Boolean(extraColor)} onChange={(e) => setExtraColor(e.target.checked ? typeDef.colors.find((c) => c !== color) ?? null : null)} className="accent-[var(--signal)]" />
                    Add a second colour photo
                  </label>
                </fieldset>
              ) : null}
              {pending ? <p className="text-[13.5px] text-muted">Asking {provider?.name} for product photos…</p> : null}
              {partnerShots?.length ? (
                <div>
                  <p className="text-[13px] font-semibold">Photos from {provider?.name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {partnerShots.map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" className="aspect-square border border-line object-cover" />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-muted">{provider?.mock || !provider?.mockups ? "Rendered by Synthora's mockup engine." : null}</p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={toDetails} disabled={pending}>
                  {pending ? "Writing…" : "Next: write the listing"}
                </Button>
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Step 4: details ── */}
      {step === 3 ? (
        <section className="space-y-5" aria-labelledby="s4">
          <h2 id="s4" className="font-serif text-[24px]">
            Title, description and disclosure
          </h2>
          {pending ? <p className="text-muted">Writing your listing…</p> : <p className="text-[13.5px] text-muted">Drafted by {writer || "the copywriter"}. Edit anything.</p>}
          <Field label="Title" htmlFor="title">
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
          </Field>
          <Field label="Search tags" htmlFor="tags" hint="Comma separated.">
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="AI tool used" htmlFor="aiTool">
              <Input id="aiTool" value={aiTool} onChange={(e) => setAiTool(e.target.value)} />
            </Field>
            <Field label="How much was AI?" htmlFor="involvement">
              <Select id="involvement" value={involvement} onChange={(e) => setInvolvement(e.target.value as "FULL" | "ASSISTED")}>
                <option value="FULL">Fully AI-made</option>
                <option value="ASSISTED">AI-made, then I edited it</option>
              </Select>
            </Field>
          </div>
          <Field label="How it was made" htmlFor="howMade" hint="Shown on the listing. Be specific: the tool, the prompt, what you changed.">
            <Textarea id="howMade" value={howMade} onChange={(e) => setHowMade(e.target.value)} maxLength={2000} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setStep(4)} disabled={pending || title.length < 3 || howMade.length < 20}>
              Next: price
            </Button>
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── Step 5: price & publish ── */}
      {step === 4 ? (
        <section className="grid gap-8 lg:grid-cols-[1fr_340px]" aria-labelledby="s5">
          <div className="space-y-5">
            <h2 id="s5" className="font-serif text-[24px]">
              Set your price
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (USD)" htmlFor="price" hint={`Minimum ${formatMoney(FEES.listing.minPriceCents)}.`}>
                <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              {provider?.kind === "self" ? (
                <Field label="Shipping per order (USD)" htmlFor="ship">
                  <Input id="ship" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} />
                </Field>
              ) : null}
            </div>
            <div className="flex items-center gap-4 border border-line bg-surface p-3">
              <div className="size-20 shrink-0 overflow-hidden">{design ? <ProductMockup shape={typeDef.shape} designUrl={design} color={color} alt="" className="h-full w-full" /> : null}</div>
              <div className="min-w-0">
                <p className="truncate font-serif text-[18px]">{title}</p>
                <p className="text-[13px] text-muted">
                  {typeDef.label} · {provider?.name} · {aiTool}
                </p>
              </div>
            </div>
            {provider?.kind === "digital" ? (
              <Field label="What buyers may do with the file" htmlFor="license">
                <Select id="license" value={license} onChange={(e) => setLicense(e.target.value as "personal" | "small-business")}>
                  <option value="personal">Personal use</option>
                  <option value="small-business">Personal and small business use</option>
                </Select>
              </Field>
            ) : null}
            <Checkbox
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
              label={
                <>
                  I confirm I have the rights to sell this item: it doesn&apos;t copy anyone else&apos;s artwork, characters, logos or trademarks, and the AI tool&apos;s terms allow commercial use. I&apos;ve read the{" "}
                  <a href="/legal/prohibited" className="underline" target="_blank">
                    prohibited items list
                  </a>
                  .
                </>
              }
            />
            {!canPublish ? (
              <Notice tone="warn" title="This will be saved as a draft">
                Finish setup to publish: {missing.join(", ")}.
              </Notice>
            ) : (
              <p className="text-[13px] text-muted">We check the files automatically, then a person reviews the listing before it goes on sale. We&apos;ll email you.</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => publish(false)} disabled={pending || !rights || priceCents < FEES.listing.minPriceCents}>
                {pending ? "Submitting…" : canPublish ? "Submit for review" : "Save listing"}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => publish(true)} disabled={pending || !rights}>
                Save as draft
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
            </div>
          </div>
          <EarningsBreakdown priceCents={priceCents} baseCostCents={provider?.kind === "pod" ? baseCost : 0} shippingCents={shippingCents} partnerBillsShipping={provider?.kind === "pod"} partnerName={provider?.name} />
        </section>
      ) : null}
    </div>
  );
}
