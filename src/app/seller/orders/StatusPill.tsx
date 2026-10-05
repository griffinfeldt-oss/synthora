import { Pill } from "@/components/ui";

const MAP: Record<string, [string, "neutral" | "ok" | "warn" | "danger" | "signal"]> = {
  PENDING: ["Unpaid", "neutral"],
  PAID: ["New", "signal"],
  IN_PRODUCTION: ["In production", "signal"],
  SHIPPED: ["Shipped", "neutral"],
  DELIVERED: ["Delivered", "ok"],
  COMPLETED: ["Paid out", "ok"],
  ACTION_NEEDED: ["Action needed", "danger"],
  CANCELED: ["Canceled", "neutral"],
  REFUNDED: ["Refunded", "neutral"],
};

export function SellerOrderStatus({ status }: { status: string }) {
  const [label, tone] = MAP[status] ?? [status, "neutral"];
  return <Pill tone={tone}>{label}</Pill>;
}

const PAYOUT: Record<string, [string, "neutral" | "ok" | "warn" | "danger" | "signal"]> = {
  NOT_READY: ["Unpaid order", "neutral"],
  HELD: ["Held", "neutral"],
  ELIGIBLE: ["Ready", "signal"],
  PAID: ["Paid", "ok"],
  REVERSED: ["Reversed", "warn"],
  CANCELED: ["None", "neutral"],
  BLOCKED: ["On hold", "warn"],
};

export function PayoutStatusPill({ status }: { status: string }) {
  const [label, tone] = PAYOUT[status] ?? [status, "neutral"];
  return <Pill tone={tone}>{label}</Pill>;
}
