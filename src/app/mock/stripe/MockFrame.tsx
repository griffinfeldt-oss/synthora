import type { ReactNode } from "react";

/** Stand-in for a Stripe-hosted page. Clearly labeled as a simulation. */
export function MockFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-lg px-4">
      <div className="border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <span className="font-sans text-[15px] font-bold tracking-tight text-[#635bff]">stripe</span>
          <span className="rounded-[2px] bg-warn-soft px-2 py-0.5 text-[11.5px] font-semibold text-warn">Simulated · test mode</span>
        </div>
        <div className="px-6 py-6">
          <h1 className="font-sans text-[20px] font-semibold">{title}</h1>
          <div className="mt-4">{children}</div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-muted">
        Demo mode: this page replaces Stripe because no Stripe key is set. Add STRIPE_SECRET_KEY to use real Stripe.
      </p>
    </div>
  );
}
