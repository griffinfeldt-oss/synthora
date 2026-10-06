import { env } from "@/lib/env";

/** Tells everyone when no real money can move: demo (simulated) or test (Stripe test mode). */
export function MockBanner() {
  if (env.mode === "live") return null;
  const text =
    env.mode === "demo"
      ? "Demo mode: payments, partners and AI are simulated. No real charges."
      : "Test mode: Stripe test payments only, no real money. Use card 4242 4242 4242 4242.";
  return <div className="bg-signal px-4 py-1.5 text-center text-[12.5px] font-semibold text-signal-ink">{text}</div>;
}
