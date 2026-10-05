import type { Metadata } from "next";
import { requireSeller } from "@/server/session";
import { onboardingState } from "@/server/sellers";
import { sellerProviders } from "../providers";
import { AiWizard } from "./AiWizard";

export const metadata: Metadata = { title: "Make one with AI" };
export const dynamic = "force-dynamic";

export default async function AiListingPage() {
  const { seller } = await requireSeller();
  const [providers, state] = await Promise.all([sellerProviders(seller), onboardingState(seller)]);
  return (
    <div>
      <h2 className="mb-6 font-serif text-[26px]">Make one with AI</h2>
      <AiWizard providers={providers} sampleDesign="/samples/design.svg" canPublish={state.canPublish} missing={state.missing} />
    </div>
  );
}
