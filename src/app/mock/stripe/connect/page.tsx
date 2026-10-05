import { notFound } from "next/navigation";
import { mock } from "@/lib/env";
import { requireSeller } from "@/server/session";
import { Button } from "@/components/ui";
import { mockConnectAction } from "../actions";
import { MockFrame } from "../MockFrame";

export default async function MockConnect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!mock.stripe) notFound();
  const { seller } = await requireSeller();
  const sp = await searchParams;
  return (
    <MockFrame title="Set up payouts for Synthora">
      <p className="text-[14px] text-muted">
        Stripe Express collects identity and bank details so {seller.shopName} can receive payouts. In demo mode we skip the forms.
      </p>
      <form action={mockConnectAction} className="mt-5">
        <input type="hidden" name="account" value={sp.account ?? ""} />
        <input type="hidden" name="return" value={sp.return ?? "/seller/onboarding"} />
        <Button type="submit" size="lg" className="w-full bg-[#635bff] text-white hover:bg-[#5146ef]">
          Complete onboarding
        </Button>
      </form>
    </MockFrame>
  );
}
