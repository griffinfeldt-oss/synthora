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

/** Renders a listing image: our SVG mockup, a partner/seller photo, or a raw design. */
export function ListingVisual({
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
