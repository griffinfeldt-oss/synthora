"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AI_TOOLS, PRODUCT_TYPES, productType } from "@/config/catalog";
import { FEES } from "@/config/fees";
import type { CatalogProduct } from "@/fulfillment/types";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { uploadFile, type UploadResult } from "@/lib/upload-client";
import { EarningsBreakdown } from "@/components/EarningsBreakdown";
import { ProductMockup } from "@/components/mockup/ProductMockup";
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { catalogAction, createListingAction } from "../actions";
import type { WizardProvider } from "../ai/AiWizard";

type Kind = "DIGITAL" | "SELF_SHIP" | "PARTNER";

export function OwnListingForm({ providers, canPublish, missing }: { providers: WizardProvider[]; canPublish: boolean; missing: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const kinds = useMemo(() => {
    const k: Array<{ id: Kind; label: string; hint: string }> = [];
    if (providers.some((p) => p.kind === "digital")) k.push({ id: "DIGITAL", label: "Digital file", hint: "Art, patterns, templates. Buyers download it." });
    if (providers.some((p) => p.kind === "self")) k.push({ id: "SELF_SHIP", label: "I ship it myself", hint: "You make it, post it and add tracking." });
    if (providers.some((p) => p.kind === "pod")) k.push({ id: "PARTNER", label: "My artwork on a partner product", hint: "Upload print-ready artwork; your partner makes it." });
    return k;
  }, [providers]);
  const [kind, setKind] = useState<Kind>(kinds[0]?.id ?? "DIGITAL");
  const typeOptions = PRODUCT_TYPES.filter((t) => t.kinds.includes(kind));
  const [typeId, setTypeId] = useState(typeOptions[0]?.id ?? "digital_art");
  const pods = providers.filter((p) => p.kind === "pod" && p.productTypes.includes(typeId));
  const [podId, setPodId] = useState(pods[0]?.id ?? "");
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const product = catalog?.find((c) => c.productType === typeId) ?? null;

  const [photos, setPhotos] = useState<UploadResult[]>([]);
  const [artwork, setArtwork] = useState<UploadResult | null>(null);
  const [file, setFile] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tool, setTool] = useState<string>(AI_TOOLS[0]);
  const [otherTool, setOtherTool] = useState("");
  const [involvement, setInvolvement] = useState<"FULL" | "ASSISTED">("FULL");
  const [howMade, setHowMade] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("");
  const [shipping, setShipping] = useState("4.00");
  const [inventory, setInventory] = useState("10");
  const [costOwn, setCostOwn] = useState("");
  const [rights, setRights] = useState(false);

  const providerId = kind === "DIGITAL" ? "digital" : kind === "SELF_SHIP" ? "self" : podId;
  const baseCost = kind === "PARTNER" ? product?.baseCostCents ?? 0 : parseMoneyToCents(costOwn) ?? 0;
  const shippingCents = kind === "PARTNER" ? product?.typicalShippingCents ?? 0 : kind === "SELF_SHIP" ? parseMoneyToCents(shipping) ?? 0 : 0;
  const priceCents = parseMoneyToCents(price) ?? 0;
  const aiTool = tool === "Other" ? otherTool.trim() : tool;

  const doUpload = (files: FileList | null, what: "photo" | "artwork" | "file") => {
    if (!files?.length) return;
    setError(null);
    start(async () => {
      try {
        for (const f of Array.from(files).slice(0, what === "photo" ? 8 : 1)) {
          setUploading(f.name);
          const res = await uploadFile(f, what === "file" ? "digital" : "image");
          if (what === "photo") setPhotos((p) => [...p, res].slice(0, 8));
          else if (what === "artwork") setArtwork(res);
          else setFile(res);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(null);
      }
    });
  };

  const submit = (asDraft: boolean) =>
    start(async () => {
      setError(null);
      const def = productType(typeId);
      const images = [
        ...(kind === "PARTNER" && artwork?.url ? [{ url: artwork.url, alt: `${title}, ${def.label.toLowerCase()}`, kind: "MOCKUP_RENDER" as const, mockup: { shape: def.shape, color: def.colors[0], designUrl: artwork.url } }] : []),
        ...photos.filter((p) => p.url).map((p) => ({ url: p.url!, alt: title, kind: "PHOTO" as const, mockup: null })),
        ...(kind === "PARTNER" && artwork?.url ? [{ url: artwork.url, alt: `${title} artwork`, kind: "DESIGN" as const, mockup: null }] : []),
      ];
      const res = await createListingAction({
        title,
        description,
        priceCents,
        productType: typeId,
        kind,
        provider: providerId,
        partnerProductId: product?.id ?? null,
        partnerVariantIds: product?.variants.map((v) => v.id) ?? [],
        baseCostCents: baseCost,
        shippingCents: kind === "SELF_SHIP" ? shippingCents : null,
        processingDays: kind === "SELF_SHIP" ? 5 : 3,
        inventory: kind === "SELF_SHIP" && inventory ? Number(inventory) : null,
        aiTool,
        aiInvolvement: involvement,
        howMade,
        prompt: null,
        generationId: null,
        designUrl: kind === "PARTNER" ? artwork?.url ?? null : null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        images,
        digitalAsset: kind === "DIGITAL" && file ? { storageKey: file.key, fileName: file.fileName, contentType: file.contentType, sizeBytes: file.size } : null,
        rightsConfirmed: rights,
        publish: !asDraft,
      });
      if (!res.ok) setError(res.error);
      else router.push(`/seller/listings/${res.id}?created=${res.status}`);
    });

  if (!kinds.length) return <Notice tone="warn">Turn on self-ship or digital, or connect a partner, on the Fulfillment partners page first.</Notice>;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-8">
        <fieldset>
          <legend className="mb-3 font-serif text-[20px]">What kind of item?</legend>
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => {
                  setKind(k.id);
                  const first = PRODUCT_TYPES.find((t) => t.kinds.includes(k.id));
                  if (first) setTypeId(first.id);
                  setCatalog(null);
                }}
                className={cn("border bg-surface p-4 text-left", kind === k.id ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong")}
              >
                <span className="block font-semibold">{k.label}</span>
                <span className="mt-1 block text-[13px] text-muted">{k.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product type" htmlFor="type">
            <Select id="type" value={typeId} onChange={(e) => { setTypeId(e.target.value); setCatalog(null); }}>
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "PARTNER" ? (
            <Field label="Partner" htmlFor="pod">
              <Select id="pod" value={podId} onChange={(e) => { setPodId(e.target.value); setCatalog(null); }}>
                {pods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        {kind === "PARTNER" ? (
          <div className="space-y-3 border border-line bg-surface p-5">
            {!catalog ? (
              <Button variant="secondary" disabled={!podId || pending} onClick={() => start(async () => { const r = await catalogAction(podId); if ("error" in r) setError(r.error); else setCatalog(r); })}>
                Load {pods.find((p) => p.id === podId)?.name ?? "partner"} options
              </Button>
            ) : product ? (
              <p className="text-[14px]">
                {product.name} · base cost from {formatMoney(product.baseCostCents)} · all {product.variants.length} sizes offered
              </p>
            ) : (
              <p className="text-[14px] text-danger">This partner doesn&apos;t make that product.</p>
            )}
            <Field label="Print-ready artwork (PNG, transparent background works best)" htmlFor="art">
              <input id="art" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => doUpload(e.target.files, "artwork")} className="block text-[14px]" />
            </Field>
            {artwork?.url ? (
              <div className="size-48 overflow-hidden border border-line">
                <ProductMockup shape={productType(typeId).shape} designUrl={artwork.url} color={productType(typeId).colors[0]} alt="Preview" className="h-full w-full" />
              </div>
            ) : null}
          </div>
        ) : null}

        {kind === "DIGITAL" ? (
          <Field label="The file buyers download" htmlFor="file" hint="PDF, ZIP, PNG, JPG, SVG, audio or embroidery formats. Up to 500 MB. Kept private; buyers get a short-lived link.">
            <input id="file" type="file" onChange={(e) => doUpload(e.target.files, "file")} className="block text-[14px]" />
            {file ? <p className="mt-1 text-[13px] font-semibold text-ok">Uploaded {file.fileName}</p> : null}
          </Field>
        ) : null}

        <Field label={kind === "PARTNER" ? "Extra photos (optional)" : "Photos"} htmlFor="photos" hint="Up to 8. The first is the main image.">
          <input id="photos" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(e) => doUpload(e.target.files, "photo")} className="block text-[14px]" />
        </Field>
        {photos.length ? (
          <ul className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <li key={p.key} className="relative size-20 overflow-hidden border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url ?? ""} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute right-0 top-0 bg-ink px-1.5 text-[12px] text-paper" aria-label="Remove photo">
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {uploading ? <p className="text-[13px] text-muted" role="status">Uploading {uploading}…</p> : null}

        <Field label="Title" htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Description" htmlFor="desc">
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="AI tool used" htmlFor="tool">
            <Select id="tool" value={tool} onChange={(e) => setTool(e.target.value)}>
              {AI_TOOLS.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value="Other">Other…</option>
            </Select>
          </Field>
          {tool === "Other" ? (
            <Field label="Which tool?" htmlFor="other">
              <Input id="other" value={otherTool} onChange={(e) => setOtherTool(e.target.value)} />
            </Field>
          ) : (
            <Field label="How much was AI?" htmlFor="inv">
              <Select id="inv" value={involvement} onChange={(e) => setInvolvement(e.target.value as "FULL" | "ASSISTED")}>
                <option value="FULL">Fully AI-made</option>
                <option value="ASSISTED">AI-made, then I edited/finished it</option>
              </Select>
            </Field>
          )}
        </div>
        <Field label="How it was made" htmlFor="how" hint="Required. Which tool, roughly what you asked for, and anything you changed by hand.">
          <Textarea id="how" value={howMade} onChange={(e) => setHowMade(e.target.value)} />
        </Field>
        <Field label="Search tags" htmlFor="tags" hint="Comma separated.">
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (USD)" htmlFor="price">
            <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          {kind === "SELF_SHIP" ? (
            <>
              <Field label="Shipping / order" htmlFor="ship">
                <Input id="ship" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} />
              </Field>
              <Field label="In stock" htmlFor="inv2">
                <Input id="inv2" inputMode="numeric" value={inventory} onChange={(e) => setInventory(e.target.value)} />
              </Field>
            </>
          ) : null}
          {kind !== "PARTNER" ? (
            <Field label="Your cost per item (optional)" htmlFor="cost" hint="Only for your profit math.">
              <Input id="cost" inputMode="decimal" value={costOwn} onChange={(e) => setCostOwn(e.target.value)} />
            </Field>
          ) : null}
        </div>

        <Checkbox
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
          label={
            <>
              I confirm this item is AI-made as described, I have the rights to sell it, it doesn&apos;t copy anyone else&apos;s work, characters or trademarks, and it isn&apos;t on the{" "}
              <a href="/legal/prohibited" target="_blank" className="underline">
                prohibited items list
              </a>
              .
            </>
          }
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!canPublish ? <Notice tone="warn" title="Will be saved as a draft">Finish setup to publish: {missing.join(", ")}.</Notice> : null}
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => submit(false)} disabled={pending || !rights || priceCents < FEES.listing.minPriceCents}>
            {pending ? "Saving…" : canPublish ? "Publish listing" : "Save listing"}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => submit(true)} disabled={pending || !rights}>
            Save as draft
          </Button>
        </div>
      </div>
      <div className="lg:sticky lg:top-6 lg:h-fit">
        <EarningsBreakdown priceCents={priceCents} baseCostCents={baseCost} shippingCents={shippingCents} partnerBillsShipping={kind === "PARTNER"} partnerName={kind === "PARTNER" ? pods.find((p) => p.id === podId)?.name : "Your costs"} />
      </div>
    </div>
  );
}
