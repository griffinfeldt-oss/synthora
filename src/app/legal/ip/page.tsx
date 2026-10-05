import type { Metadata } from "next";
import { Container, Notice, PageBand } from "@/components/ui";
import { TakedownForm } from "./TakedownForm";

export const metadata: Metadata = { title: "Report IP infringement" };

export default function IpPage() {
  return (
    <>
      <div className="pt-6">
        <PageBand title="Intellectual property" sub="How to report a listing that copies your work, and what happens next." />
      </div>
      <Container className="mt-12 grid max-w-5xl gap-12 lg:grid-cols-[1fr_1fr]">
        <article className="prose-lm">
          <Notice tone="warn" title="Draft, pending legal review" className="mb-6" />
          <h2>Our policy</h2>
          <p>AI makes it easy to imitate. Sellers must confirm they hold the rights to everything they list, and we remove listings that copy others&apos; artwork, characters, logos or trademarks.</p>
          <h2>What happens after you send a notice</h2>
          <ol>
            <li>We confirm receipt by email with a reference number.</li>
            <li>We review it within 2 business days. Valid notices lead to the listing being removed and the seller being told.</li>
            <li>The seller may file a counter-notice. If they do, we share it with you; unless you tell us you have started legal action within 10 business days, we may restore the listing.</li>
            <li>Shops with repeated valid notices are closed.</li>
          </ol>
          <p>Sending a knowingly false notice can make you liable for damages. If you are not sure, consider using the &ldquo;Report this listing&rdquo; link instead.</p>
        </article>
        <section aria-labelledby="notice-form">
          <h2 id="notice-form" className="mb-4 font-serif text-[24px]">
            Send a notice
          </h2>
          <TakedownForm />
        </section>
      </Container>
    </>
  );
}
