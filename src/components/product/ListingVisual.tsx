import type { ImageKind } from "@prisma/client";
import { ProductMockup } from "@/components/mockup/ProductMockup";
import { productType } from "@/config/catalog";
import { cn } from "@/lib/utils";

export interface VisualImage {
  url: string;
  alt: string;
  kind: ImageKind | string;
  mockup?: unknown;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="pointer-events-none absolute left-2 top-2 z-10 bg-ink/80 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-paper">{children}</span>;
}

/** What kind of picture this is, so buyers never mistake a mockup for a photo of the product. */
export function imageLabel(kind: string, productTypeId: string): string | null {
  if (kind === "MOCKUP_RENDER" || kind === "MOCKUP_PARTNER") return productType(productTypeId).shape === "digital" ? "Preview" : "Mockup";
  if (kind === "DESIGN") return "Artwork preview";
  return null;
}

/** Renders a listing image: our SVG mockup, a partner/seller photo, or a raw design. */
export function ListingVisual(props: Parameters<typeof Visual>[0] & { labelled?: boolean }) {
  const { labelled = props.detail ?? false, ...rest } = props;
  const label = labelled && props.image ? imageLabel(props.image.kind, props.productTypeId) : null;
  if (!label) return <Visual {...rest} />;
  return (
    // Keep the caller's positioning (usually absolute inset-0); otherwise make room for the label.
    <div className={cn(/\b(absolute|fixed)\b/.test(props.className ?? "") ? "" : "relative", props.className)}>
      <Label>{label}</Label>
      <Visual {...rest} className="absolute inset-0" />
    </div>
  );
}

function Visual({
  image,
  productTypeId,
  className,
  variant = 0,
  detail = false,
}: {
  image: VisualImage | undefined;
  productTypeId: string;
  className?: string;
  variant?: number;
  detail?: boolean;
}) {
  if (!image) return <div className={cn("bg-surface-2", className)} />;
  if (image.kind === "MOCKUP_RENDER") {
    const m = (image.mockup ?? {}) as { shape?: string; color?: string; designUrl?: string };
    return (
      <ProductMockup
        shape={m.shape ?? productType(productTypeId).shape}
        color={m.color}
        designUrl={m.designUrl ?? image.url}
        alt={image.alt}
        variant={variant}
        detail={detail}
        className={cn("block h-full w-full", className)}
      />
    );
  }
  if (image.kind === "DESIGN") {
    return (
      <div className={cn("grid place-items-center bg-[var(--mock-2)] p-[8%]", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.alt} className="h-full w-full object-contain" loading="lazy" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.url} alt={image.alt} className={cn("block h-full w-full object-cover", className)} loading="lazy" />;
}
