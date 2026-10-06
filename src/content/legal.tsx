/**
 * Legal copy. DRAFTS written to describe how the product actually works; they
 * must be reviewed by a lawyer before launch. Fee numbers come from config.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { FEES } from "@/config/fees";
import { BRAND } from "@/config/brand";
import { LAUNCH } from "@/config/launch";

const fee = `$${(FEES.subscription.monthlyCents / 100).toFixed(2)}`;
const commission = `${FEES.commission.rateBps / 100}%`;
const countries = LAUNCH.territory.buyerCountries.join(", ");

export const LEGAL: Record<string, { title: string; updated: string; body: ReactNode }> = {
  "seller-terms": {
    title: "Seller terms",
    updated: "5 October 2026",
    body: (
      <>
        <p>These terms apply when you open a shop on Synthora (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating a shop you agree to them and to the <Link href="/legal/buyer-terms">buyer terms</Link>, <Link href="/legal/privacy">privacy policy</Link> and <Link href="/legal/prohibited">prohibited items list</Link>.</p>
        <h2>1. What you can sell</h2>
        <p>Only products made with AI. This includes items that are fully AI-generated and items that are AI-generated and then edited or finished by you. Every listing must name the AI tool used and include an honest &ldquo;how it was made&rdquo; note. Misrepresenting how something was made is grounds for removal.</p>
        <p>You need a confirmed email address to open a shop{LAUNCH.sellerSignup === "invite" ? ", and while we start small, an invite code" : ""}. New shops are reviewed before they can sell.</p>
        <h2>1a. Listing review</h2>
        <p>We check every listing&apos;s files automatically (that they open, are what they claim to be, and have enough resolution for the sizes you offer), then a person reviews it before it goes on sale. Changes to the words, AI disclosure or files of a listing that is on sale are reviewed too; until they are approved, buyers keep seeing and buying the approved version. Each buyer gets the exact version, file and licence that was on sale when they paid.</p>
        <h2>2. Your rights to what you sell</h2>
        <p>When you publish a listing you confirm that you have the right to sell it: it does not copy or imitate another person&apos;s artwork, characters, logos, trademarks or likeness, and the terms of the AI tool you used permit commercial use of its output. You are responsible for claims arising from your listings. We respond to intellectual-property notices as described in our <Link href="/legal/ip">IP policy</Link>.</p>
        <h2>3. Fees</h2>
        <ul>
          <li>A subscription of {fee} per month, billed by Stripe. If a payment fails, your listings are paused (not deleted) until the plan is paid.</li>
          <li>A commission of {commission} of the item price of each sale. Shipping charges are not commissioned.</li>
          <li>Card processing fees charged by Stripe ({FEES.processing.rateBps / 100}% + {FEES.processing.fixedCents}¢ for standard cards), passed through at cost and deducted from your payout. When a cart contains items from several sellers, the fee is split in proportion to each seller&apos;s share of the charge.</li>
        </ul>
        <h2>4. Payments and payouts</h2>
        <p>Buyers pay Synthora. We hold your share until the buyer confirms delivery or {FEES.payoutHold.daysAfterDelivered} days after tracking shows the order delivered ({FEES.payoutHold.digitalDays} days after purchase for digital goods; {FEES.payoutHold.daysAfterShippedWithoutDelivery} days after shipping if no delivery scan is received). We then transfer your earnings to your Stripe Express account. Payouts may be held during disputes, investigations, while your shop is suspended, or while we check a difference between our records and Stripe&apos;s.</p>
        <p>If Stripe has not yet reported the exact card fee when an order is paid, we use the standard estimate and correct it to the actual fee once Stripe reports it.</p>
        <h2>5. Fulfillment partners</h2>
        <p>You may connect your own accounts at Printify, Printful, Gelato or other supported partners. Orders are placed in your partner account and your partner bills you directly for production and shipping. We do not pay partner invoices. You are responsible for keeping your partner account in good standing; if a partner rejects an order you must fix it or refund the buyer promptly.</p>
        <h2>6. Self-shipped and digital items</h2>
        <p>If you ship items yourself you must dispatch within your stated processing time and enter a valid tracking number. Digital files must match the listing and be free of malware.</p>
        <h2>7. Refunds and chargebacks</h2>
        <p>Refunds reduce your earnings for that order. If you have already been paid, we reverse that much of your transfer from your Stripe balance. If your balance cannot cover it, the amount becomes a balance you owe us, shown on your Earnings page, and is deducted from your next payouts. On a refund we return our commission on the refunded amount (never more than we charged); Stripe does not return processing fees. Chargebacks you lose are treated as refunds.</p>
        <h2>8. Suspension</h2>
        <p>We may approve, suspend or close shops and remove listings that break these terms, the prohibited items list or the law. We will tell you why unless we are legally unable to.</p>
        <h2>9. Taxes</h2>
        <p>You are responsible for taxes on your income. Stripe may issue tax forms for payouts. Synthora does not add sales tax at checkout today; where the law requires a marketplace to collect it, we will do so before selling there and explain how it affects your listings.</p>
        <h2>9a. Where we sell</h2>
        <p>For now we sell only to buyers in: {countries}.</p>
        <h2>9b. AI studio</h2>
        <p>The &ldquo;Make one with AI&rdquo; studio is included with an approved shop and an active plan, within fair-use limits ({LAUNCH.ai.batchesPerSellerPerHour} sets of designs an hour, {LAUNCH.ai.batchesPerSellerPerDay} a day). It is not unlimited, and we may pause it. Designs you generate are stored privately; only reduced previews are public.</p>
        <h2>10. Changes</h2>
        <p>We will give at least 30 days&apos; notice of changes to fees.</p>
      </>
    ),
  },
  "buyer-terms": {
    title: "Buyer terms",
    updated: "5 October 2026",
    body: (
      <>
        <p>Synthora is a marketplace. Items are made and sold by independent sellers; we run the checkout, hold payments and step in when something goes wrong.</p>
        <h2>1. AI-made products</h2>
        <p>Everything sold here is made with AI. Each listing tells you which tool was used and how. If a listing&apos;s disclosure is wrong, report it and we will investigate.</p>
        <h2>2. Paying</h2>
        <p>You pay Synthora through Stripe. Your card details are entered on Stripe and never reach our servers. Prices are in US dollars and do not currently include sales tax. Shipping is quoted from each seller&apos;s fulfillment partner at checkout. For now we deliver only to: {countries}.</p>
        <p>Your order is confirmed, and files unlock, only when Stripe confirms the payment. Some bank payments take a few days; we email you when they clear.</p>
        <h2>3. Made to order</h2>
        <p>Most physical items are produced after you order, so production times apply before shipping. Estimated delivery times are shown at checkout.</p>
        <h2>4. Delivery and confirmation</h2>
        <p>You can confirm delivery on your order page. Confirming releases the seller&apos;s payment. If you don&apos;t, we release it automatically a set number of days after tracking shows delivery.</p>
        <h2>5. Problems</h2>
        <p>See our <Link href="/legal/returns">returns policy</Link>. Contact us before filing a chargeback; we can usually resolve problems faster.</p>
        <h2>6. Digital downloads</h2>
        <p>Each digital file comes with the licence shown on the listing when you bought it (for example <Link href="/legal/licenses/personal-v1">Personal use</Link>); later changes to the listing or licence do not change what you bought. Download links are private to you and expire after a few minutes; you can get a new one from your order page, up to 20 times per item. A full refund ends the licence and the download.</p>
        <p>To see past orders placed as a guest in your account, confirm your email address.</p>
        <h2>7. What our checks mean</h2>
        <p>Listings show what the seller says about how an item was made, whether Synthora recorded the generation, whether the files passed our checks, and who reviewed the listing. A review is not a guarantee that a design is original or free of others&apos; rights, and AI-made work may have limited copyright protection.</p>
        <h2>8. Reviews</h2>
        <p>You can review items after delivery. Reviews must be honest and about the product.</p>
      </>
    ),
  },
  privacy: {
    title: "Privacy policy",
    updated: "6 October 2026",
    body: (
      <>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: name, email, password (stored only as a salted hash).</li>
          <li>Orders: items, shipping address, email, and payment status. Card numbers are handled by Stripe; we never see or store them.</li>
          <li>Sellers: shop details, Stripe account identifiers, and partner API credentials, which we encrypt at rest (AES-256-GCM).</li>
          <li>Usage: server logs for security and debugging, including failed sign-ins and the network address they came from.</li>
          <li>Waitlist: if you join our waitlist, your email, the link to your work (creators), any note you add, and which link brought you. We use it only to tell you about Synthora opening and to choose founding creators.</li>
          <li>Shopping activity: which product pages are viewed and when checkouts start, linked to a random visitor id stored in a first-party cookie, so we can understand what buyers want. We exclude our own staff and test traffic.</li>
        </ul>
        <h2>Who we share it with</h2>
        <ul>
          <li>The seller you buy from, and their fulfillment partner (e.g. Printful, Printify, Gelato), receive your name and shipping address so they can make and deliver your order.</li>
          <li>Stripe processes payments and seller payouts.</li>
          <li>Our hosting, database, storage and email providers, under data-processing agreements.</li>
          <li>AI providers receive sellers&apos; design prompts when sellers use the listing studio. Buyer data is never sent to AI providers.</li>
        </ul>
        <h2>Your choices</h2>
        <p>You can request a copy or deletion of your data by emailing {BRAND.privacyEmail}. Order records we must keep for tax and accounting are retained for the legally required period.</p>
        <h2>Cookies</h2>
        <p>We use a sign-in cookie, a random visitor-id cookie for our own shopping statistics, and store your cart and theme choice in your browser. We do not use advertising cookies or share these with anyone.</p>
      </>
    ),
  },
  returns: {
    title: "Returns & problems",
    updated: "5 October 2026",
    body: (
      <>
        <p>Most items are made to order just for you, so we can&apos;t accept returns for change of mind. But if something is wrong, we&apos;ll make it right.</p>
        <h2>Covered</h2>
        <ul>
          <li>Damaged or defective items: contact us within 30 days of delivery with a photo. You get a free replacement or full refund.</li>
          <li>Wrong item or wrong size sent (versus what you ordered).</li>
          <li>Never arrived: if tracking hasn&apos;t moved for 14 days, or the item didn&apos;t arrive within 30 days of the estimate.</li>
          <li>Significantly not as described, including a false AI disclosure.</li>
          <li>Digital files that are corrupt or don&apos;t match the listing.</li>
        </ul>
        <h2>Not covered</h2>
        <ul>
          <li>Ordering the wrong size or changing your mind on a made-to-order item.</li>
          <li>Minor colour differences between screens and print.</li>
          <li>Changing your mind about a digital file. A file that is faulty or not as described is covered whether or not you have downloaded it.</li>
        </ul>
        <p>None of this limits rights you have under your local consumer law.</p>
        <h2>How</h2>
        <p>Use &ldquo;Get help with this order&rdquo; on your order page, or email {BRAND.supportEmail} with your order number. We hold the seller&apos;s payment until delivery, so refunds are quick. Refunds go back to your original payment method in 5–10 business days.</p>
      </>
    ),
  },
  prohibited: {
    title: "Prohibited items",
    updated: "5 October 2026",
    body: (
      <>
        <p>These may not be sold on Synthora. Listings that break these rules are removed, and repeated violations close the shop.</p>
        <ul>
          <li>Anything not made with AI, or with a false or missing AI disclosure.</li>
          <li>Copies or close imitations of another artist&apos;s work; designs using trademarks, logos, brand names, or copyrighted characters you don&apos;t own (including &ldquo;in the style of&rdquo; a named living artist where it imitates identifiable works).</li>
          <li>Images of real, identifiable people without their consent, including celebrities and public figures; any sexual or nude depiction of a real person.</li>
          <li>Sexual content involving minors or anyone appearing to be a minor. Zero tolerance; reported to authorities.</li>
          <li>Adult sexual content.</li>
          <li>Hate symbols, harassment, content that promotes violence or terrorism.</li>
          <li>Misleading health, medical or financial claims; counterfeit documents, IDs, currency.</li>
          <li>Weapons, drugs, and items illegal to sell in the buyer&apos;s or seller&apos;s jurisdiction.</li>
          <li>Malware, or digital files that include licences you do not have the right to grant.</li>
          <li>Anything your fulfillment partner&apos;s own content policy forbids.</li>
        </ul>
      </>
    ),
  },
};
