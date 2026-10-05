import type { Metadata } from "next";
import { requireSeller } from "@/server/session";
import { onboardingState } from "@/server/sellers";
import { sellerProviders } from "../providers";
import { OwnListingForm } from "./OwnListingForm";

export const metadata: Metadata = { title: "List my own" };
export const dynamic = "force-dynamic";

export default async function OwnListingPage() {
  const { seller } = await requireSeller();
  const [providers, state] = await Promise.all([sellerProviders(seller), onboardingState(seller)]);
  return (
    <div>
      <h2 className="mb-6 font-serif text-[26px]">List my own</h2>
      <OwnListingForm providers={providers} canPublish={state.canPublish} missing={state.missing} />
    </div>
  );
}
