import { notFound } from "next/navigation";
import { FEES } from "@/config/fees";
import { mock } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { requireSeller } from "@/server/session";
import { Button } from "@/components/ui";
import { mockSubscribeAction } from "../actions";
import { MockFrame } from "../MockFrame";

export default async function MockSubscribe({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!mock.stripe) notFound();
  await requireSeller();
  const sp = await searchParams;
  return (
    <MockFrame title={`Subscribe to ${FEES.subscription.productName}`}>
      <p className="font-sans text-[28px] font-semibold">
        {formatMoney(FEES.subscription.monthlyCents)} <span className="text-[15px] font-normal text-muted">per month</span>
      </p>
      <p className="mt-2 text-[14px] text-muted">Billed monthly. Cancel anytime from your dashboard.</p>
      <form action={mockSubscribeAction} className="mt-5">
        <input type="hidden" name="return" value={sp.return ?? "/seller/onboarding"} />
        <Button type="submit" size="lg" className="w-full bg-[#635bff] text-white hover:bg-[#5146ef]">
          Subscribe
        </Button>
      </form>
    </MockFrame>
  );
}
