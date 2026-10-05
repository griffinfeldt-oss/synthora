"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/lib/money";
import { requireAdmin } from "@/server/session";
import { actOnTakedown, resolveReport, setListingModeration, setSellerStatus } from "@/server/trust";
import { applyRefund, refundWholeOrder } from "@/server/refunds";
import { releaseDuePayouts } from "@/server/payouts";

type Result = { ok: boolean; message: string } | null;

export async function sellerStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const status = String(formData.get("status")) as "APPROVED" | "SUSPENDED" | "PENDING";
  await setSellerStatus(admin.id, String(formData.get("sellerId")), status, String(formData.get("reason") ?? "") || undefined);
  revalidatePath("/admin/sellers");
}

export async function listingModerationAction(formData: FormData) {
  const admin = await requireAdmin();
  await setListingModeration(admin.id, String(formData.get("listingId")), String(formData.get("action")) as "suspend" | "restore" | "remove", String(formData.get("reason") ?? "") || undefined);
  revalidatePath("/admin/listings");
  revalidatePath("/admin/reports");
}

export async function resolveReportAction(formData: FormData) {
  const admin = await requireAdmin();
  await resolveReport(admin.id, String(formData.get("reportId")), String(formData.get("outcome")) as "ACTIONED" | "DISMISSED", String(formData.get("note") ?? "") || undefined);
  if (formData.get("suspend") === "1") await setListingModeration(admin.id, String(formData.get("listingId")), "suspend", "Reported: " + String(formData.get("reason") ?? ""));
  revalidatePath("/admin/reports");
}

export async function takedownAction(formData: FormData) {
  const admin = await requireAdmin();
  await actOnTakedown(admin.id, String(formData.get("takedownId")), String(formData.get("action")) as "remove" | "reject" | "restore", String(formData.get("note") ?? "") || undefined);
  revalidatePath("/admin/reports");
}

export async function adminRefundAction(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim() || "Refunded by Synthora";
  try {
    if (formData.get("scope") === "order") {
      const total = await refundWholeOrder(String(formData.get("orderId")), reason, admin.id);
      revalidatePath(`/admin/orders/${formData.get("orderId")}`);
      return { ok: true, message: `Refunded $${(total / 100).toFixed(2)} across all sellers.` };
    }
    const amount = formData.get("amount") ? parseMoneyToCents(String(formData.get("amount"))) ?? undefined : undefined;
    const res = await applyRefund({ sellerOrderId: String(formData.get("sellerOrderId")), amountCents: amount, reason, source: "admin", actorId: admin.id });
    revalidatePath(`/admin/orders/${formData.get("orderId")}`);
    return { ok: true, message: `Refunded $${(res.refundedCents / 100).toFixed(2)}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Refund failed" };
  }
}

export async function runPayoutsAction(_prev: Result): Promise<Result> {
  await requireAdmin();
  const r = await releaseDuePayouts();
  revalidatePath("/admin");
  return { ok: true, message: `Paid ${r.paid} (${(r.totalCents / 100).toFixed(2)} USD), ${r.blocked} blocked, ${r.failed} failed.` };
}
