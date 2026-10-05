"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sellers", label: "Sellers" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/reports", label: "Reports & IP" },
  { href: "/admin/orders", label: "Orders & refunds" },
  { href: "/admin/ledger", label: "Ledger" },
  { href: "/admin/outbox", label: "Email outbox" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? path === l.href : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined} className={cn("block whitespace-nowrap px-3 py-2 text-[14px] font-medium", active ? "bg-ink text-paper" : "text-muted hover:bg-ink/5 hover:text-ink")}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
