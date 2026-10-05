import Link from "next/link";
import type { Metadata } from "next";
import { requireSeller } from "@/server/session";
import { onboardingState } from "@/server/sellers";
import { Notice, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListing() {
  const { seller } = await requireSeller();
  const state = await onboardingState(seller);
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-[24px]">What are you listing?</h2>
      {!state.canPublish ? (
        <Notice tone="warn" title="You can build listings now; they publish once setup is done">
          Still to do: {state.missing.join(", ")}. <Link href="/seller/onboarding" className="underline">Checklist</Link>
        </Notice>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/seller/listings/new/ai" className="group border border-line bg-surface p-7 hover:border-ink">
          <Pill tone="signal">About 2 minutes</Pill>
          <h3 className="mt-3 font-serif text-[26px] group-hover:underline">Make one with AI</h3>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[14.5px] text-muted">
            <li>Pick a product and print partner</li>
            <li>Describe the design in plain words</li>
            <li>Choose one of four AI versions and see the mockup</li>
            <li>We write the title and description; you set the price</li>
          </ol>
        </Link>
        <Link href="/seller/listings/new/own" className="group border border-line bg-surface p-7 hover:border-ink">
          <Pill>Bring your own</Pill>
          <h3 className="mt-3 font-serif text-[26px] group-hover:underline">List my own</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[14.5px] text-muted">
            <li>Digital files: art, patterns, templates</li>
            <li>Things you make and ship yourself</li>
            <li>Your own AI artwork on a partner product</li>
          </ul>
        </Link>
      </div>
    </div>
  );
}
