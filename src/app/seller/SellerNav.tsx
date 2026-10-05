"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/seller", label: "Overview" },
  { href: "/seller/listings/new", label: "New listing" },
  { href: "/seller/listings", label: "Listings" },
  { href: "/seller/orders", label: "Orders" },
  { href: "/seller/payouts", label: "Earnings & billing" },
  { href: "/seller/partners", label: "Fulfillment partners" },
  { href: "/seller/onboarding", label: "Setup checklist" },
  { href: "/seller/settings", label: "Shop settings" },
];

export function SellerNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/seller" ? path === href : href === "/seller/listings" ? path === href || /^\/seller\/listings\/(?!new)/.test(path) : path.startsWith(href));
  return (
    <nav aria-label="Seller" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={cn(
                "block whitespace-nowrap px-3 py-2 text-[14px] font-medium",
                active(l.href) ? "bg-ink text-paper" : "text-muted hover:bg-ink/5 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
