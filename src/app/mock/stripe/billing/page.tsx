import { notFound } from "next/navigation";
import { mock } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { requireSeller } from "@/server/session";
import { Button } from "@/components/ui";
import { mockBillingAction } from "../actions";
import { MockFrame } from "../MockFrame";

export default async function MockBilling({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!mock.stripe) notFound();
  const { seller } = await requireSeller();
  const sp = await searchParams;
  const ret = sp.return ?? "/seller/payouts";
  const op = (value: string, label: string, variant: "primary" | "secondary" | "danger" = "secondary") => (
    <form action={mockBillingAction}>
      <input type="hidden" name="op" value={value} />
      <input type="hidden" name="return" value={ret} />
      <Button type="submit" variant={variant} className="w-full">
        {label}
      </Button>
    </form>
  );
  return (
    <MockFrame title="Billing">
      <p className="text-[14px]">
        Plan status: <strong>{seller.subscriptionStatus.replace("_", " ").toLowerCase()}</strong>
        {seller.currentPeriodEnd ? ` · renews ${formatDate(seller.currentPeriodEnd)}` : ""}
      </p>
      <div className="mt-5 grid gap-2">
        {op("pay", "Update card and pay now", "primary")}
        {op("fail", "Simulate a failed renewal")}
        {op("cancel", "Cancel plan", "danger")}
      </div>
    </MockFrame>
  );
}
