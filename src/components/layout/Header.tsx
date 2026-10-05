import Link from "next/link";
import { CATEGORIES } from "@/config/catalog";
import { currentUser, isAdmin } from "@/server/session";
import { Logo } from "./Logo";
import { CartButton, MobileMenu, ThemeToggle } from "./ClientBits";

export async function Header() {
  const user = await currentUser();
  const sellerHref = user?.seller ? "/seller" : "/sell";
  const mobileLinks = [
    { href: "/shop", label: "Shop all" },
    ...CATEGORIES.map((c) => ({ href: `/shop?category=${c.id}`, label: c.label })),
    { href: "/how-it-works", label: "How it works" },
    { href: sellerHref, label: user?.seller ? "Seller dashboard" : "Sell on Latent" },
    { href: user ? "/account" : "/sign-in", label: user ? "Your account" : "Sign in" },
    ...(isAdmin(user) ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="relative border-b border-line bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 pt-5 pb-3 sm:px-5 md:pt-7">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href={sellerHref} className="hidden items-center gap-2 px-2 font-serif text-[14px] text-muted hover:text-ink md:inline-flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" />
            </svg>
            {user?.seller ? "Seller dashboard" : "Sell on Latent"}
          </Link>
          <Link href={user ? "/account" : "/sign-in"} className="hidden items-center gap-2 px-2 font-serif text-[14px] text-muted hover:text-ink md:inline-flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
            {user ? (user.name?.split(" ")[0] ?? "Account") : "Sign in"}
          </Link>
          {isAdmin(user) ? (
            <Link href="/admin" className="hidden px-2 font-serif text-[14px] text-muted hover:text-ink md:inline-flex">
              Admin
            </Link>
          ) : null}
          <ThemeToggle />
          <CartButton />
          <MobileMenu links={mobileLinks} />
        </div>
      </div>
      <nav aria-label="Main" className="hidden md:block">
        <ul className="mx-auto flex max-w-[1200px] items-center justify-center gap-2 px-5 pb-3 text-[14px] font-semibold">
          <li>
            <Link href="/" className="block px-5 py-3 text-ink hover:text-signal">
              Home
            </Link>
          </li>
          <li className="group relative">
            <Link href="/shop" className="flex items-center gap-1 px-5 py-3 text-ink/75 hover:text-signal group-focus-within:text-signal" aria-haspopup="true">
              Shop
              <svg width="10" height="10" viewBox="0 0 12 8" aria-hidden>
                <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" />
              </svg>
            </Link>
            <ul className="invisible absolute left-1/2 top-full z-40 w-56 -translate-x-1/2 border border-line bg-surface py-2 opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <li>
                <Link href="/shop" className="block px-4 py-2 text-ink hover:bg-paper">
                  All products
                </Link>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c.id}>
                  <Link href={`/shop?category=${c.id}`} className="block px-4 py-2 font-medium text-ink/80 hover:bg-paper hover:text-ink">
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <Link href="/how-it-works" className="block px-5 py-3 text-ink/75 hover:text-signal">
              How it works
            </Link>
          </li>
          <li>
            <Link href="/sell" className="block px-5 py-3 text-ink/75 hover:text-signal">
              Sell
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
