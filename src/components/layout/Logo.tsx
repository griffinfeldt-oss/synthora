import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("whitespace-nowrap font-serif leading-none tracking-[-0.01em]", className)}>
      <span className="italic">synth</span>
      <span>ora</span>
      <span className="brand-pixel" aria-hidden />
    </span>
  );
}

export function Logo({ tagline = true }: { tagline?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-4 text-ink" aria-label={`${BRAND.name} home`}>
      <Wordmark className="text-[26px] min-[400px]:text-[30px] sm:text-[38px]" />
      {tagline ? (
        <span className="hidden max-w-[150px] font-serif text-[13px] leading-snug text-muted lg:block">{BRAND.tagline}</span>
      ) : null}
    </Link>
  );
}
