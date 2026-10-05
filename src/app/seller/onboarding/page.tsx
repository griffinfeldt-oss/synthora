import Link from "next/link";
import type { Metadata } from "next";
import { FEES } from "@/config/fees";
import { mock } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/session";
import { onboardingState } from "@/server/sellers";
import { ActionForm } from "@/components/ActionForm";
import { Button, ButtonLink, Checkbox, Field, Input, Notice, Textarea } from "@/components/ui";
import { createShopAction, refreshPayoutsAction, startPayoutsAction, startPlanAction } from "../actions";

export const metadata: Metadata = { title: "Seller setup" };
export const dynamic = "force-dynamic";

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 border border-line bg-surface p-5">
      <span aria-hidden className={`grid size-9 shrink-0 place-items-center font-serif text-[16px] ${done ? "bg-ok text-white dark:text-[#1a1a1f]" : "border border-line-strong"}`}>
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-[20px]">
          {title} {done ? <span className="sr-only">(done)</span> : null}
        </h3>
        <div className="mt-1.5 text-[14.5px] text-muted">{children}</div>
      </div>
    </li>
  );
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("/seller/onboarding");
  const sp = await searchParams;

  if (!user.seller) {
    return (
      <div className="mx-auto max-w-xl">
        <h2 className="font-serif text-[26px]">Tell us about your shop</h2>
        <p className="mt-1 text-muted">
          {formatMoney(FEES.subscription.monthlyCents)}/month plus {FEES.commission.rateBps / 100}% per sale. Card processing is passed through at cost. You can change all of this later.
        </p>
        <ActionForm action={createShopAction} submitLabel="Create my shop" className="mt-6">
          <Field label="Shop name" htmlFor="shopName">
            <Input id="shopName" name="shopName" required maxLength={60} placeholder="e.g. Night Shift Prints" />
          </Field>
          <Field label="Where you're based (optional)" htmlFor="location">
            <Input id="location" name="location" maxLength={80} placeholder="City, country" />
          </Field>
          <Field label="Short bio (optional)" htmlFor="bio" hint="What you make and which AI tools you like to use.">
            <Textarea id="bio" name="bio" maxLength={600} />
          </Field>
          <Checkbox
            name="agree"
            required
            label={
              <>
                I agree to the <Link href="/legal/seller-terms" className="underline">seller terms</Link> and will only list AI-made products, disclosed honestly.
              </>
            }
          />
        </ActionForm>
      </div>
    );
  }

  const seller = user.seller;
  const state = await onboardingState(seller);
  const allDone = state.payouts && state.plan && state.fulfillment;

  return (
    <div className="max-w-3xl space-y-6">
      {sp.stripe === "return" && !state.payouts ? (
        <Notice tone="warn" title="Stripe still needs a few details">
          Finish the remaining steps in Stripe, or refresh if you just completed them.
          <form action={refreshPayoutsAction} className="mt-2">
            <Button size="sm" variant="secondary">
              Refresh status
            </Button>
          </form>
        </Notice>
      ) : null}
      {sp.plan === "canceled" ? <Notice tone="warn" title="Plan not started">No charge was made. Start it whenever you are ready.</Notice> : null}
      {allDone ? (
        <Notice tone="ok" title={state.approved ? "You're all set" : "Setup complete, awaiting approval"}>
          {state.approved ? "Your listings go live as soon as you publish." : "We review new shops within one business day. You can create listings now; they appear once you're approved."}
        </Notice>
      ) : null}
      <ol className="space-y-3">
        <Step n={1} done title="Shop profile">
          {seller.shopName} · <Link href="/seller/settings" className="underline">edit</Link>
        </Step>
        <Step n={2} done={state.payouts} title="Payouts with Stripe">
          {state.payouts ? (
            "Stripe Express account connected. Earnings are transferred after delivery."
          ) : (
            <>
              <p>Stripe verifies your identity and bank so we can send your earnings. Takes about 5 minutes.</p>
              <form action={startPayoutsAction} className="mt-3">
                <Button size="sm">{seller.stripeAccountId ? "Continue Stripe setup" : "Set up payouts"}</Button>
              </form>
            </>
          )}
        </Step>
        <Step n={3} done={state.plan} title={`${formatMoney(FEES.subscription.monthlyCents)}/month seller plan`}>
          {state.plan ? (
            "Active. Manage it from Earnings & billing."
          ) : (
            <>
              <p>
                {seller.subscriptionStatus === "NONE"
                  ? "One flat monthly fee keeps your listings live. If a payment fails, listings pause; nothing is deleted."
                  : `Your plan is ${seller.subscriptionStatus.toLowerCase().replace("_", " ")}. Listings are paused until it is paid.`}
              </p>
              <form action={startPlanAction} className="mt-3">
                <Button size="sm">Start plan</Button>
              </form>
            </>
          )}
        </Step>
        <Step n={4} done={state.fulfillment} title="How you'll fulfil orders">
          <p>Connect Printify, Printful or Gelato (your own account, billed by them), or choose to ship it yourself or sell digital files.</p>
          <ButtonLink href="/seller/partners" size="sm" variant={state.fulfillment ? "secondary" : "primary"} className="mt-3">
            {state.fulfillment ? "Manage partners" : "Choose fulfillment"}
          </ButtonLink>
        </Step>
        <Step n={5} done={state.approved} title="Shop review">
          {state.approved ? "Approved." : seller.status === "SUSPENDED" ? `Suspended: ${seller.statusReason ?? "contact support"}.` : "A person checks every new shop, usually within one business day."}
        </Step>
      </ol>
      {allDone ? (
        <ButtonLink href="/seller/listings/new" size="lg">
          Create your first listing
        </ButtonLink>
      ) : null}
      {mock.stripe ? <p className="text-[13px] text-muted">Demo mode: Stripe steps open simulated pages; nothing is charged.</p> : null}
    </div>
  );
}
