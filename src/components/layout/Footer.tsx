import Link from "next/link";
import { BRAND } from "@/config/brand";
import { Wordmark } from "./Logo";
import { NewsletterForm } from "./NewsletterForm";

const nav = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/sell", label: "Sell" },
  { href: "/how-it-works", label: "How it works" },
];

const legal = [
  { href: "/legal/buyer-terms", label: "Buyer terms" },
  { href: "/legal/seller-terms", label: "Seller terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/returns", label: "Returns" },
  { href: "/legal/prohibited", label: "Prohibited items" },
  { href: "/legal/ip", label: "Report IP infringement" },
];

export function Footer() {
  return (
    <footer className="mt-24">
      <div className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-4 px-4 py-10 sm:flex-row sm:px-5">
          <p className="font-serif text-[17px] italic text-muted">
            Sign up to our mailing list
          </p>
          <NewsletterForm />
        </div>
      </div>
      <div className="bg-band text-band-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-5">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <Wordmark className="text-[30px]" />
              <p className="mt-3 max-w-xs text-[13px] text-band-muted">
                A marketplace for products made with AI. Every listing names the
                tool and says how it was made.
              </p>
            </div>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-semibold">
                {nav.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-signal">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex items-center gap-3">
              <span className="font-serif text-[15px] italic text-band-muted">
                Follow us on:
              </span>
              {[
                {
                  label: "Instagram",
                  href: BRAND.social.instagram,
                  d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm5.5-1.5h.01",
                },
                {
                  label: "Pinterest",
                  href: BRAND.social.pinterest,
                  d: "M12 3a9 9 0 0 0-3.3 17.4c-.1-.7-.1-1.8 0-2.6l1-4.4s-.3-.5-.3-1.3c0-1.2.7-2.1 1.6-2.1.8 0 1.1.6 1.1 1.2 0 .8-.5 1.9-.7 2.9-.2.9.4 1.6 1.3 1.6 1.6 0 2.8-1.7 2.8-4.1 0-2.1-1.5-3.6-3.7-3.6-2.5 0-4 1.9-4 3.8 0 .8.3 1.6.7 2",
                },
                {
                  label: "TikTok",
                  href: BRAND.social.tiktok,
                  d: "M14 3v11.5a3.5 3.5 0 1 1-3-3.46M14 3c.5 2.5 2 4 5 4.3",
                },
              ]
                .filter((s) => s.href)
                .map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${BRAND.name} on ${s.label}`}
                    className="text-band-ink hover:text-signal"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden
                    >
                      <path d={s.d} />
                    </svg>
                  </a>
                ))}
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-6 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-band-muted">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-band-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4">
              <p className="font-serif text-[13px] text-band-muted">
                © {new Date().getFullYear()} Synthora
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-band-ink">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <rect x="5" y="11" width="14" height="10" rx="1" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                Payments by Stripe
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
