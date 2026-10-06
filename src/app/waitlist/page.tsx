import type { Metadata } from "next";
import { BRAND } from "@/config/brand";
import { Container, PageBand } from "@/components/ui";
import { WaitlistForm } from "./WaitlistForm";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description: `${BRAND.name}: the marketplace for AI-made goods. Every item says how it was made.`,
};

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <>
      <div className="pt-6">
        <PageBand
          title="The marketplace for AI-made goods"
          sub="Prints, shirts, stickers and digital art, made with AI and labelled honestly. Every item says which tool made it and how."
        />
      </div>
      <Container className="mt-16 grid max-w-5xl gap-14 md:grid-cols-[1fr_420px]">
        <div className="space-y-10">
          <section>
            <p className="font-serif text-[15px] italic text-signal">For creators</p>
            <h2 className="mt-1 font-serif text-[28px] leading-tight">Become a founding creator</h2>
            <ul className="mt-4 space-y-2 text-[15px] text-muted">
              <li>Your shop plan is free for your first months.</li>
              <li>A Founding Creator badge and a spot on the home page at launch.</li>
              <li>List in about two minutes: no inventory, printing and shipping handled by print partners.</li>
              <li>A place where AI work is welcome, not banned or buried.</li>
            </ul>
            <p className="mt-3 text-[13px] text-muted">We&apos;re starting with a small group, picked by hand.</p>
          </section>
          <section>
            <p className="font-serif text-[15px] italic text-signal">For shoppers</p>
            <h2 className="mt-1 font-serif text-[28px] leading-tight">Know exactly what you&apos;re buying</h2>
            <p className="mt-4 text-[15px] text-muted">
              No guessing whether something is AI. Every listing names the tool, shows how it was made, and is checked by a person before it goes on sale.
            </p>
          </section>
        </div>
        <div className="border border-line bg-surface p-6 sm:p-8">
          <WaitlistForm source={ref?.slice(0, 40)} />
        </div>
      </Container>
    </>
  );
}
