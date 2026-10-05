"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";

export function CartButton() {
  const { count, ready } = useCart();
  return (
    <Link href="/cart" className="relative inline-flex h-10 items-center gap-2 px-2 text-ink hover:text-signal" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.76L21 8H6.2" />
        <circle cx="9.5" cy="19.5" r="1.3" />
        <circle cx="17.5" cy="19.5" r="1.3" />
      </svg>
      <span
        className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-ink px-1 text-[11px] font-semibold text-paper"
        aria-hidden
      >
        {ready ? count : 0}
      </span>
    </Link>
  );
}

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("lm-theme") as Theme) || "system");
    } catch {
      // ignore
    }
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("lm-theme");
      else localStorage.setItem("lm-theme", t);
    } catch {
      // ignore
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  const next: Theme = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
  const label = theme === "system" ? "Theme: system" : theme === "dark" ? "Theme: dark" : "Theme: light";
  return (
    <button type="button" onClick={() => apply(next)} className="inline-flex size-10 items-center justify-center text-ink hover:text-signal" aria-label={`${label}. Switch to ${next}.`} title={label}>
      {theme === "dark" ? (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      ) : theme === "light" ? (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

export function MobileMenu({ links }: { links: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center text-ink"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <nav id="mobile-nav" className="absolute inset-x-0 top-full z-40 border-y border-line bg-surface px-4 py-3 shadow-lg">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block py-3 text-[15px] font-semibold text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
