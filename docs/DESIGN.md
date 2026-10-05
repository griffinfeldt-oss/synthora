# Synthora — Design brief

## Source of the format

The layout follows the Webflow **"Fre" eCommerce template** in the Webflow project
set up for this marketplace (named `Latent Market`, the working name before Synthora) (studied in the Designer on 2026‑10‑02). We keep its editorial
skeleton and replace the generic parts with a brand of our own.

What we keep from Fre:

| Fre element | Synthora version |
| --- | --- |
| Header: script wordmark + small serif tagline on the left, contact links and a cart badge on the right | Wordmark `synthora▪` + tagline "Goods made with AI, labeled honestly". Right side: Sell, Account, theme toggle, cart with count badge |
| Centered nav row under the header (Home · Shop ▾ · Contact) | Centered nav: Shop ▾ (categories) · AI tools · Sell · How it works |
| Inset full‑bleed hero photo, dark overlay, large centered Playfair headline, square dark button | Inset hero band built from a collage of real listing mockups, dark overlay, centered serif headline, square button |
| Three dark category tiles with serif labels bottom‑right | Category tiles (Apparel, Art & Prints, Home, Digital…) |
| Centered serif section title with a short rule underneath ("Featured Products") | Same section heading component (`<SectionTitle>`) |
| Three‑column product grid: image, centered serif name, light serif price | Same grid, plus an AI‑tool chip on each card (the disclosure is the product) |
| "Our Brands" logo row | "Made with" row of AI tools sellers used |
| Mailing list band: italic serif label, inline input, dark button | Kept as the newsletter band |
| Dark footer: bold sans nav links, italic "Follow us on:" + icons, credit line, Stripe badge | Same, plus legal links and "Payments by Stripe" |
| Inner pages: dark title band ("Shop", product name) | `<PageBand>` on Shop, listing, cart, legal, account pages |
| Shop: left sidebar ("About", "Categories" headings with a hairline rule) + product grid | Left sidebar holds filters (type, category, AI tool, price) + search |
| Product: big stacked images left; category label, serif name, grey price, description, quantity, "Add to Cart"/"Buy now" right | Same, plus a **"How it was made"** disclosure panel, seller card, fulfillment and delivery info, reviews, report link |

## Brand

- **Name.** *Synthora*: from *synthesis* (everything here is made by AI
  synthesis) with the *-ora* of *aurora*, a little light. One word, easy to say.
- **Mark.** `synthora▪`: *synth* in italic, *ora* in roman, closed by a small
  square "pixel" full stop in the signal colour. The pixel nods to what every
  design starts as; the full stop to the plain statement each listing makes about
  how it was made. It is the only ornament we use.
- **Voice.** Plain, specific, honest. Every listing says which AI made it and how.
  We never hide the AI; the disclosure is a selling point.
- **Type.** *Playfair Display* (headings, product names, prices, italic accents,
  as in Fre) and *Poppins* (navigation, buttons, labels, UI). Body copy is Poppins
  15px instead of Fre's 14px grey Playfair, which fails contrast and is hard to read
  at small sizes.
- **Colour.** Fre's neutrals with one signal colour:
  - Paper `#F5F5F7` (page), White `#FFFFFF` (sections and cards), Ink `#212127`.
  - Muted text `#5C5C66` (Fre used `#919197`, which is 3.2:1 on white; ours is about 6.5:1).
  - Hairlines `#E4E4EA`.
  - **Signal `#C2410C`** (burnt vermilion): AI‑tool chips, the logo pixel, focus
    accents. White on signal and signal on white both pass AA.
  - Dark theme: page `#111114`, surface `#1A1A1F`, ink `#EDEDF2`, muted `#A3A3AD`,
    signal `#FB923C`.
- **Shape.** Square corners (2px radius, as in Fre), hairline rules, no drop shadows
  except on mockups and the cart drawer.
- **Motion.** Kept small: 150ms colour and opacity transitions, image cross‑fade on
  card hover. Everything respects `prefers-reduced-motion`.

## Product imagery

Mockups have to look real. The renderer (`src/lib/mockup`) draws each product
(tee, hoodie, mug, poster, canvas, tote, sticker, phone case, digital) as layered
SVG: a product silhouette, a fabric or material texture from `feTurbulence`, the
design warped onto the print area with a displacement map, and light and shadow
passes on top. When a partner offers a mockup API (Printful mockup generator,
Printify product images) we use the partner's photos instead.

## Accessibility

- Text contrast is AA or better in both themes; focus rings are 2px signal colour
  with offset.
- Every interactive element is a real `<button>`/`<a>`/`<input>` with a label.
- Images have alt text written from the listing (title + product type).
- Layouts work from 360px wide. Grids drop to two columns at 640px and one column
  at 380px; the header collapses into a menu button, as Fre does.

## Pages

Public: Home, Shop, Listing, Seller shop, Cart, Checkout, Order tracking,
Account, Sell (pricing + calculator), How it works, Legal (6 pages), IP takedown.
Seller: Onboarding, Dashboard, Listings, New listing (AI / own), Orders, Payouts,
Partners, Settings. Admin: Overview, Sellers, Listings, Reports & takedowns,
Orders & refunds, Ledger, Email outbox.
