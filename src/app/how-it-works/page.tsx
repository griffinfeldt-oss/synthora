import type { Metadata } from "next";
import Link from "next/link";
import { FEES } from "@/config/fees";
import { Container, PageBand, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <>
      <div className="pt-6">
        <PageBand title="How Latent.Market works" sub="A marketplace where AI-made is the point, not the fine print." />
      </div>
      <Container className="mt-16 max-w-3xl">
        <SectionTitle>For buyers</SectionTitle>
        <div className="prose-lm mx-auto">
          <h3>Every product tells you how it was made</h3>
          <p>Each listing names the AI tool (Midjourney, Flux, Firefly, GPT Image and others), says whether it is fully AI-made or finished by hand, and includes the seller&apos;s own note on the process, often with the prompt.</p>
          <h3>Real products, made to order</h3>
          <p>Most physical items are printed on demand by Printful, Printify or Gelato after you order, so nothing sits in a warehouse. Some makers ship items themselves, and digital files download instantly.</p>
          <h3>Your payment is protected</h3>
          <p>
            You pay Latent.Market through Stripe; card details never touch our servers. We hold the seller&apos;s share until your order is delivered. If something arrives damaged or wrong, our <Link href="/legal/returns">returns policy</Link> covers you.
          </p>
          <h3>See something off?</h3>
          <p>Every listing has a &ldquo;Report this listing&rdquo; link. Rights owners can file an <Link href="/legal/ip">IP notice</Link>.</p>
        </div>
        <SectionTitle className="mt-20">For sellers</SectionTitle>
        <div className="prose-lm mx-auto">
          <p>
            Sellers pay ${(FEES.subscription.monthlyCents / 100).toFixed(0)} a month and {FEES.commission.rateBps / 100}% per sale, with card processing passed through at cost. They connect their own print partner accounts, so partners bill them directly for production.{" "}
            <Link href="/sell">See seller pricing</Link>.
          </p>
        </div>
      </Container>
    </>
  );
}
