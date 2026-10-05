import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── Buttons ────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "signal" | "danger" | "light" | "dark";
const base =
  "inline-flex items-center justify-center gap-2 rounded-[2px] font-sans font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none";
const sizes = { sm: "h-9 px-3.5 text-[13px]", md: "h-11 px-5 text-sm", lg: "h-12 px-6 text-[15px]" };
const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink",
  ghost: "text-ink hover:bg-ink/5",
  signal: "bg-signal text-signal-ink hover:brightness-95",
  danger: "bg-danger text-white hover:brightness-95 dark:text-[#1a1a1f]",
  light: "bg-white text-[#212127] hover:bg-white/90",
  /** Always-dark button for use on photos (Fre's hero button). */
  dark: "bg-[#212127] text-white hover:bg-black",
};

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cn(base, sizes[size], variants[variant], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ─── Forms ──────────────────────────────────────────────────────────────────

const control =
  "w-full rounded-[2px] border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-muted/80 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)] aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-11 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-[14px] leading-snug", className)}>
      <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-[var(--signal)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

// ─── Display ────────────────────────────────────────────────────────────────

export function SectionTitle({ children, sub, className, as: Tag = "h2" }: { children: ReactNode; sub?: ReactNode; className?: string; as?: "h1" | "h2" }) {
  return (
    <div className={cn("mb-10 text-center", className)}>
      <Tag className="font-serif text-[28px] text-ink sm:text-[32px]">{children}</Tag>
      <span aria-hidden className="mx-auto mt-4 block h-px w-12 bg-ink" />
      {sub ? <p className="mx-auto mt-4 max-w-xl text-muted">{sub}</p> : null}
    </div>
  );
}

/** Fre's dark title band used at the top of inner pages. */
export function PageBand({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1340px] px-4 sm:px-5">
      <div className="flex min-h-[150px] flex-col items-center justify-center bg-band px-5 py-10 text-center text-band-ink sm:min-h-[200px]">
        <h1 className="font-serif text-[30px] sm:text-[44px]">{title}</h1>
        {sub ? <p className="mt-3 max-w-xl text-[14px] text-band-muted">{sub}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-5", className)}>{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border border-line bg-surface", className)}>{children}</div>;
}

export function SidebarHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <h2 className="shrink-0 font-serif text-[20px]">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

const tones = {
  neutral: "bg-ink/[0.06] text-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  signal: "bg-signal-soft text-signal",
} as const;

export function Pill({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", title, children, className }: { tone?: keyof typeof tones; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("border-l-2 px-4 py-3 text-[14px]", tones[tone], tone === "neutral" ? "border-ink" : "border-current", className)} role={tone === "danger" ? "alert" : undefined}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? "mt-1" : "", "text-ink/90")}>{children}</div> : null}
    </div>
  );
}

/** Disclosure chip: which AI made it. Every product card shows one. */
export function AiChip({ tool, className }: { tool: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[2px] border border-signal/40 bg-signal-soft px-2 py-0.5 text-[11.5px] font-semibold text-signal", className)}>
      <span aria-hidden className="size-1.5 bg-signal" />
      <span className="sr-only">Made with </span>
      {tool}
    </span>
  );
}

export function Stars({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <span aria-hidden className="inline-flex" style={{ gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} width={size} height={size} viewBox="0 0 20 20">
            <defs>
              <linearGradient id={`half-${i}`}>
                <stop offset="50%" stopColor="var(--ink)" />
                <stop offset="50%" stopColor="var(--line-strong)" />
              </linearGradient>
            </defs>
            <path
              d="M10 1.5l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L1.3 7.7l6.1-.6z"
              fill={rounded >= i ? "var(--ink)" : rounded >= i - 0.5 ? `url(#half-${i})` : "var(--line-strong)"}
            />
          </svg>
        ))}
      </span>
      <span className="sr-only">{value.toFixed(1)} out of 5 stars</span>
      {count !== undefined ? <span>({count})</span> : null}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <p className="font-serif text-[22px]">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-muted">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border border-line bg-surface p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-[28px] leading-none">{value}</p>
      {hint ? <p className="mt-2 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto border border-line bg-surface", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[14px] [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:bg-surface-2 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-[12px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-muted">
        {children}
      </table>
    </div>
  );
}
