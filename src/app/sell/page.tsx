import type { Metadata } from "next";
import { FEES } from "@/config/fees";
import { formatMoney } from "@/lib/money";
import { currentUser } from "@/server/session";
import { ButtonLink, Container, PageBand, SectionTitle } from "@/components/ui";
import { Calculator } from "./Calculator";

export const metadata: Metadata = { title: "Sell on Latent.Market" };

export default async function SellPage() {
  const user = await currentUser();
  const cta = user?.seller ? "/seller" : user ? "/seller/onboarding" : "/sign-up?next=/seller/onboarding";
  return (
    <>
      <div className="pt-6">
        <PageBand title="Sell what you make with AI" sub="Describe it, pick a design, choose a print partner, publish. We handle checkout, payments and payouts.">
          <ButtonLink href={cta} variant="light" size="lg" className="mt-7">
            {user?.seller ? "Go to your dashboard" : "Open a shop"}
          </ButtonLink>
        </PageBand>
      </div>
      <Container className="mt-20">
        <SectionTitle sub="No listing fees, no tiers.">Simple pricing</SectionTitle>
        <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
          {[
            [formatMoney(FEES.subscription.monthlyCents), "per month", "Keeps your shop open. If a payment fails your listings pause; nothing is deleted."],
            [`${FEES.commission.rateBps / 100}%`, "per sale", "On the item price. Shipping passes through to your partner with no commission."],
            ["At cost", "card processing", `Stripe's ${FEES.processing.rateBps / 100}% + ${FEES.processing.fixedCents}¢, passed through exactly. Split fairly when a cart has several shops.`],
          ].map(([big, small, body]) => (
            <div key={small} className="bg-surface p-7 text-center">
              <p className="font-serif text-[40px] leading-none">{big}</p>
              <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{small}</p>
              <p className="mt-3 text-[14px] text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Container>
      <Container className="mt-20 max-w-4xl">
        <SectionTitle>What you&apos;d earn</SectionTitle>
        <Calculator />
      </Container>
      <Container className="mt-20">
        <SectionTitle>How selling works</SectionTitle>
        <ol className="grid gap-6 md:grid-cols-4">
          {[
            ["Set up", "Create a shop, connect Stripe for payouts, start the plan, and link your Printify, Printful or Gelato account. Or ship yourself, or sell files."],
            ["Make", "Type what you want. Get four AI versions, see a realistic mockup, and we draft the title and description."],
            ["Sell", "Buyers pay us at checkout. The order goes straight to your partner, printed on demand and billed to your partner account."],
            ["Get paid", `After delivery is confirmed (or ${FEES.payoutHold.daysAfterDelivered} days after tracking says delivered) we transfer your earnings to your bank via Stripe.`],
          ].map(([t, d], i) => (
            <li key={t} className="border-t-2 border-ink pt-4">
              <p className="font-serif text-[15px] italic text-signal">0{i + 1}</p>
              <h3 className="mt-1 font-serif text-[22px]">{t}</h3>
              <p className="mt-2 text-[14px] text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Container>
      <Container className="mt-20 max-w-3xl">
        <SectionTitle>The rules</SectionTitle>
        <ul className="space-y-3 text-[15px]">
          <li>✦ Only AI-made products. Fully AI-made is welcome; so is AI plus your own finishing.</li>
          <li>✦ Every listing names the AI tool and says how it was made. Buyers see it before they buy.</li>
          <li>✦ You must own the rights to what you sell: no copied art, characters, logos or celebrities.</li>
          <li>✦ Your partner account bills you for production. We never pay partner bills or hold your partner keys in plain text.</li>
        </ul>
        <div className="mt-10 text-center">
          <ButtonLink href={cta} size="lg">
            {user?.seller ? "Go to your dashboard" : "Open a shop"}
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
