/**
 * Trust & safety: moderation, reports, IP takedowns, reviews.
 */
import "server-only";
import type { ReportReason, SellerStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { audit, notifySeller } from "./notify";

async function emailAdmins(subject: string, text: string) {
  for (const to of env.adminEmails) await sendEmail({ to, subject, text });
}

// ─── Moderation ──────────────────────────────────────────────────────────────

export async function setSellerStatus(adminId: string, sellerId: string, status: SellerStatus, reason?: string) {
  const seller = await db.seller.update({ where: { id: sellerId }, data: { status, statusReason: reason ?? null } });
  if (status === "SUSPENDED") {
    await db.sellerOrder.updateMany({ where: { sellerId, payoutStatus: { in: ["HELD", "ELIGIBLE"] } }, data: { payoutStatus: "BLOCKED" } });
  } else if (status === "APPROVED") {
    await db.sellerOrder.updateMany({ where: { sellerId, payoutStatus: "BLOCKED" }, data: { payoutStatus: "HELD" } });
  }
  await audit(adminId, `seller.${status.toLowerCase()}`, "Seller", sellerId, { reason });
  await notifySeller(sellerId, {
    type: `seller_${status.toLowerCase()}`,
    title: status === "APPROVED" ? "Your shop is approved" : status === "SUSPENDED" ? "Your shop is suspended" : "Your shop is under review",
    body:
      status === "APPROVED"
        ? `${seller.shopName} is live. Your active listings now show in the shop.`
        : status === "SUSPENDED"
          ? `Your listings are hidden and payouts are on hold. Reason: ${reason ?? "policy review"}. Reply to this email to appeal.`
          : "We are reviewing your shop.",
    href: "/seller",
  });
}

export async function setListingModeration(adminId: string, listingId: string, action: "suspend" | "restore" | "remove", reason?: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found");
  const status = action === "restore" ? "ACTIVE" : action === "suspend" ? "SUSPENDED" : "REMOVED";
  await db.listing.update({ where: { id: listingId }, data: { status, statusReason: reason ?? null } });
  await audit(adminId, `listing.${action}`, "Listing", listingId, { reason });
  await notifySeller(listing.sellerId, {
    type: `listing_${action}`,
    title: action === "restore" ? `"${listing.title}" is live again` : `"${listing.title}" was taken down`,
    body: action === "restore" ? "Your listing was reviewed and restored." : `Reason: ${reason ?? "policy review"}. Reply to this email if you think this is a mistake.`,
    href: `/seller/listings/${listingId}`,
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function createReport(input: { listingId: string; reason: ReportReason; details: string; reporterId: string | null; email: string | null }) {
  const listing = await db.listing.findUnique({ where: { id: input.listingId }, select: { id: true, title: true } });
  if (!listing) throw new Error("Listing not found");
  const report = await db.report.create({
    data: {
      listingId: input.listingId,
      reason: input.reason,
      details: input.details.trim().slice(0, 2000),
      reporterId: input.reporterId,
      email: input.email,
    },
  });
  await emailAdmins(`New report: ${listing.title}`, `Reason: ${input.reason}\n\n${input.details}\n\n${env.appUrl}/admin/reports`);
  return report;
}

export async function resolveReport(adminId: string, reportId: string, outcome: "ACTIONED" | "DISMISSED", note?: string) {
  await db.report.update({ where: { id: reportId }, data: { status: outcome, adminNote: note ?? null, resolvedAt: new Date() } });
  await audit(adminId, `report.${outcome.toLowerCase()}`, "Report", reportId, { note });
}

// ─── IP / copyright takedowns ────────────────────────────────────────────────

export async function submitTakedown(input: {
  listingUrl: string;
  claimantName: string;
  claimantEmail: string;
  claimantAddress?: string;
  rightsOwner: string;
  workDescription: string;
  infringementNote: string;
  goodFaith: boolean;
  accurate: boolean;
  signature: string;
}) {
  if (!input.goodFaith || !input.accurate) throw new Error("Both statements are required for a valid notice.");
  const slug = input.listingUrl.match(/\/l\/([a-z0-9-]+)/i)?.[1];
  const listing = slug ? await db.listing.findUnique({ where: { slug }, select: { id: true, title: true, sellerId: true } }) : null;
  const t = await db.takedownRequest.create({ data: { ...input, listingId: listing?.id ?? null } });
  await emailAdmins(`IP notice received${listing ? `: ${listing.title}` : ""}`, `${input.claimantName} <${input.claimantEmail}> on behalf of ${input.rightsOwner}\n\n${input.infringementNote}\n\n${env.appUrl}/admin/reports`);
  await sendEmail({
    to: input.claimantEmail,
    subject: "We received your IP notice",
    text: `Thanks. Reference ${t.id}. We review notices within 2 business days and will email you the outcome.`,
  });
  return t;
}

export async function actOnTakedown(adminId: string, takedownId: string, action: "remove" | "reject" | "restore", note?: string) {
  const t = await db.takedownRequest.findUnique({ where: { id: takedownId }, include: { listing: true } });
  if (!t) throw new Error("Notice not found");
  if (action === "remove" && t.listing) {
    await db.listing.update({ where: { id: t.listing.id }, data: { status: "REMOVED", statusReason: "IP notice" } });
    await notifySeller(t.listing.sellerId, {
      type: "takedown",
      title: `"${t.listing.title}" removed after an IP notice`,
      body: `We received a copyright/IP notice from ${t.rightsOwner} and removed this listing. If you believe this is a mistake, you can file a counter-notice from your listing page.`,
      href: `/seller/listings/${t.listing.id}`,
    });
  }
  if (action === "restore" && t.listing) {
    await db.listing.update({ where: { id: t.listing.id }, data: { status: "ACTIVE", statusReason: null } });
  }
  await db.takedownRequest.update({
    where: { id: takedownId },
    data: { status: action === "remove" ? "LISTING_REMOVED" : action === "reject" ? "REJECTED" : "RESTORED", adminNote: note ?? null },
  });
  await sendEmail({
    to: t.claimantEmail,
    subject: `Update on your IP notice ${t.id}`,
    text:
      action === "remove"
        ? "The listing you reported has been removed."
        : action === "reject"
          ? `We reviewed your notice and did not remove the listing. ${note ?? ""}`
          : "The seller filed a counter-notice and the listing has been restored.",
  });
  await audit(adminId, `takedown.${action}`, "TakedownRequest", takedownId, { note });
}

export async function fileCounterNotice(sellerId: string, listingId: string, statement: string) {
  const t = await db.takedownRequest.findFirst({
    where: { listingId, status: "LISTING_REMOVED", listing: { sellerId } },
    orderBy: { createdAt: "desc" },
  });
  if (!t) throw new Error("No removed listing to contest.");
  await db.takedownRequest.update({ where: { id: t.id }, data: { status: "COUNTER_NOTICE", counterNotice: statement.slice(0, 4000) } });
  await emailAdmins("Counter-notice filed", `${env.appUrl}/admin/reports\n\n${statement}`);
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function reviewableItem(userId: string, orderItemId: string) {
  return db.orderItem.findFirst({
    where: {
      id: orderItemId,
      order: { buyerId: userId },
      sellerOrder: { status: { in: ["DELIVERED", "COMPLETED"] } },
      review: null,
    },
  });
}

export async function createReview(userId: string, orderItemId: string, rating: number, body: string) {
  const item = await reviewableItem(userId, orderItemId);
  if (!item) throw new Error("You can review an item once it has been delivered.");
  if (rating < 1 || rating > 5) throw new Error("Choose 1 to 5 stars.");
  await db.review.create({
    data: { listingId: item.listingId, orderItemId, buyerId: userId, rating, body: body.trim().slice(0, 2000) },
  });
  const agg = await db.review.aggregate({ where: { listingId: item.listingId, status: "VISIBLE" }, _avg: { rating: true }, _count: true });
  await db.listing.update({
    where: { id: item.listingId },
    data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
  });
}
