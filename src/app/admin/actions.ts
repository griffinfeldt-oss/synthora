"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { parseMoneyToCents } from "@/lib/money";
import { probeBucketPolicies } from "@/lib/storage";
import { runJobs, retryJob } from "@/server/jobs";
import { approveVersion, requestChanges } from "@/server/listings";
import { audit } from "@/server/notify";
import { clearPayoutHalt, runReconciliation } from "@/server/reconcile";
import { recoverOperations, resolveByHand } from "@/server/resolution";
import { writeOffReceivable } from "@/server/receivables";
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
  return { ok: true, message: `Paid ${r.paid} (${(r.totalCents / 100).toFixed(2)} USD), ${r.blocked} blocked, ${r.failed} failed, ${r.pending} waiting for Stripe to confirm.` };
}

// ─── Listing review ──────────────────────────────────────────────────────────

export async function reviewDecisionAction(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireAdmin("/admin/review");
  const versionId = String(formData.get("versionId"));
  const decision = String(formData.get("decision"));
  const scope = formData.getAll("scope").map(String).filter(Boolean);
  const note = String(formData.get("note") ?? "").trim();
  if (!scope.length) return { ok: false, message: "Tick what you checked." };
  try {
    if (decision === "approve") await approveVersion(admin.id, versionId, scope.join("; "), note || null);
    else await requestChanges(admin.id, versionId, scope.join("; "), note);
    revalidatePath("/admin/review");
    return { ok: true, message: decision === "approve" ? "Approved. It's on sale." : "Sent back to the seller." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the decision." };
  }
}

// ─── Action queue ────────────────────────────────────────────────────────────

export async function resolveOperationAction(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireAdmin("/admin/actions");
  const outcome = String(formData.get("outcome")) === "CONFIRMED" ? "CONFIRMED" : "FAILED";
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { ok: false, message: "Say what you checked (for example, what Stripe shows)." };
  try {
    await resolveByHand({ opId: String(formData.get("opId")), actorId: admin.id, outcome, providerRef: String(formData.get("providerRef") ?? "").trim() || null, note });
    revalidatePath("/admin/actions");
    return { ok: true, message: "Resolved and recorded." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not resolve." };
  }
}

export async function retryJobAction(formData: FormData) {
  const admin = await requireAdmin("/admin/actions");
  const id = String(formData.get("jobId"));
  await retryJob(id);
  await audit(admin.id, "job.retried", "Job", id);
  revalidatePath("/admin/actions");
}

export async function clearHaltAction(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireAdmin("/admin/actions");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { ok: false, message: "Note how the difference was resolved." };
  await clearPayoutHalt(admin.id, String(formData.get("sellerId")), note);
  revalidatePath("/admin/actions");
  return { ok: true, message: "Payouts resumed for this seller." };
}

export async function writeOffAction(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireAdmin("/admin/actions");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { ok: false, message: "Note why this is being written off." };
  try {
    await writeOffReceivable(admin.id, String(formData.get("receivableId")), note);
    revalidatePath("/admin/actions");
    return { ok: true, message: "Written off. Recorded as a platform loss." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not write off." };
  }
}

export async function runReconciliationAction(_prev: Result): Promise<Result> {
  await requireAdmin("/admin/reconciliation");
  const run = await runReconciliation();
  revalidatePath("/admin/reconciliation");
  return { ok: run.status !== "FAILED", message: `Checked ${run.checked} orders: ${run.status === "OK" ? "no differences" : run.status === "FAILED" ? `failed (${run.error})` : `${(run.differences as unknown[]).length} difference(s)`}.` };
}

export async function runJobsAction(_prev: Result): Promise<Result> {
  await requireAdmin("/admin/actions");
  const jobs = await runJobs({ limit: 50 });
  const ops = await recoverOperations();
  revalidatePath("/admin/actions");
  return { ok: true, message: `Ran ${jobs.ran} job(s), ${jobs.dead} gave up; rechecked ${ops.checked} operation(s), settled ${ops.settled}.` };
}

export async function probeStorageAction(_prev: Result): Promise<Result> {
  await requireAdmin("/admin/readiness");
  const res = await probeBucketPolicies();
  return { ok: res.privateBlocked === true && res.publicReadable === true, message: res.detail };
}

export async function createInviteAction(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireAdmin("/admin/sellers");
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const code = `SYN-${randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  await db.sellerInvite.create({ data: { code, email, note: String(formData.get("note") ?? "").trim() || null, createdBy: admin.id } });
  await audit(admin.id, "invite.created", "SellerInvite", code, { email });
  revalidatePath("/admin/sellers");
  return { ok: true, message: `Invite code: ${code}${email ? ` (only for ${email})` : ""}` };
}
