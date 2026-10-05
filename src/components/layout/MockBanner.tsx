import { mock } from "@/lib/env";

/** A thin strip telling everyone the app is running on mocks (hidden once Stripe is live). */
export function MockBanner() {
  if (!mock.stripe) return null;
  return (
    <div className="bg-signal px-4 py-1.5 text-center text-[12.5px] font-semibold text-signal-ink">
      Demo mode: payments, partners and AI are simulated. No real charges.
    </div>
  );
}
