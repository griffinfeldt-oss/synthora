"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LAUNCH, providerEnabled } from "@/config/launch";
import { db } from "@/lib/db";
import { isLive, mock } from "@/lib/env";
import { parseMoneyToCents } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { payments } from "@/lib/payments";
import { getProvider, isOAuthAvailable } from "@/fulfillment/registry";
import { requireSeller, requireUser } from "@/server/session";
import { connectPartner, disconnectPartner, startPayoutOnboarding, startPlanCheckout, syncConnectAccount } from "@/server/sellers";
import { ListingError, setListingStatusBySeller, submitForReview, updateListingBasics } from "@/server/listings";
import { addSelfShipTracking, retryFulfillment, simulatePartnerEvent } from "@/server/fulfillment";
import { applyRefund } from "@/server/refunds";
import { fileCounterNotice } from "@/server/trust";
import { randomToken } from "@/lib/crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

type Result = { ok: boolean; message: string } | null;

// ─── Onboarding ─────────────────────────────────────────────────────────────

const profileSchema = z.object({
  shopName: z.string().trim().min(2, "Name your shop").max(60),
  location: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(600).optional(),
  agree: z.literal("on", { message: "Accept the seller terms to continue" }),
  invite: z.string().trim().max(60).optional(),
});

export async function createShopAction(_prev: Result, formData: FormData): Promise<Result> {
  const user = await requireUser("/seller/onboarding");
  if (user.seller) redirect("/seller/onboarding");
  if (!user.emailVerified) return { ok: false, message: "Confirm your email first: use the link we sent, or send a new one from your account page." };
  const parsed = profileSchema.safeParse({
    shopName: formData.get("shopName"),
    location: formData.get("location") || undefined,
    bio: formData.get("bio") || undefined,
    agree: formData.get("agree"),
    invite: formData.get("invite") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  // Invite-only launch: the code must exist, be unused, and match the email if it names one.
  let inviteId: string | null = null;
  if (LAUNCH.sellerSignup === "invite") {
    const invite = parsed.data.invite ? await db.sellerInvite.findUnique({ where: { code: parsed.data.invite } }) : null;
    if (!invite || invite.usedAt || (invite.email && invite.email.toLowerCase() !== user.email)) {
      return { ok: false, message: "Selling is invite-only for now. Enter the invite code we sent you." };
    }
    inviteId = invite.id;
  }
  let slug = slugify(parsed.data.shopName) || "shop";
  if (await db.seller.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const seller = await db.seller.create({
    data: {
      userId: user.id,
      shopName: parsed.data.shopName,
      slug,
      location: parsed.data.location,
      bio: parsed.data.bio,
      // Keyless demo approves instantly; test and live shops wait for an admin.
      status: env.mode === "demo" ? "APPROVED" : "PENDING",
    },
  });
  if (inviteId) await db.sellerInvite.updateMany({ where: { id: inviteId, usedAt: null }, data: { usedAt: new Date(), sellerId: seller.id } });
  redirect("/seller/onboarding");
}

export async function startPayoutsAction() {
  const { seller, user } = await requireSeller();
  const url = await startPayoutOnboarding({ ...seller, user });
  redirect(url);
}

export async function refreshPayoutsAction() {
  const { seller } = await requireSeller();
  if (seller.stripeAccountId && !mock.stripe) await syncConnectAccount(seller.stripeAccountId);
  revalidatePath("/seller/onboarding");
}

export async function startPlanAction() {
  const { seller, user } = await requireSeller();
  const url = await startPlanCheckout({ ...seller, user });
  redirect(url);
}

export async function billingPortalAction() {
  const { seller, user } = await requireSeller();
  if (!seller.stripeCustomerId) {
    const url = await startPlanCheckout({ ...seller, user });
    redirect(url);
  }
  const url = await payments().createBillingPortal({ customerId: seller.stripeCustomerId!, returnUrl: `${env.appUrl}/seller/payouts`, sellerId: seller.id });
  redirect(url);
}

export async function stripeDashboardAction() {
  const { seller } = await requireSeller();
  if (!seller.stripeAccountId) redirect("/seller/onboarding");
  redirect(await payments().createDashboardLink(seller.stripeAccountId!));
}

export async function setFulfillmentOptionAction(formData: FormData) {
  const { seller } = await requireSeller();
  const option = String(formData.get("option"));
  const enabled = formData.get("enabled") === "true";
  if (enabled && !providerEnabled(option)) redirect("/seller/partners?error=" + encodeURIComponent("That option is not available on Synthora right now."));
  await db.seller.update({
    where: { id: seller.id },
    data: option === "self" ? { offersSelfShip: enabled } : option === "digital" ? { offersDigital: enabled } : {},
  });
  revalidatePath("/seller/partners");
  revalidatePath("/seller/onboarding");
}

// ─── Partners ───────────────────────────────────────────────────────────────

export async function connectPartnerAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller } = await requireSeller();
  const providerId = String(formData.get("provider"));
  const demo = formData.get("demo") === "true";
  const provider = getProvider(providerId);
  if (!providerEnabled(provider.id)) return { ok: false, message: `${provider.name} is not available on Synthora right now.` };
  // Demo connections are fine for test mode, never for real orders.
  if (demo && isLive()) return { ok: false, message: "Demo connections are not available on the live marketplace." };
  const credentials: Record<string, string> = {};
  if (!demo) {
    for (const f of provider.auth.fields ?? []) {
      const v = String(formData.get(f.key) ?? "").trim();
      if (!v && !f.optional) return { ok: false, message: `${f.label} is required.` };
      if (v) credentials[f.key] = v;
    }
  }
  try {
    const res = await connectPartner({ sellerId: seller.id, providerId, credentials: demo ? null : credentials, demo });
    revalidatePath("/seller/partners");
    revalidatePath("/seller/onboarding");
    return { ok: true, message: `Connected to ${res.accountLabel}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? `Could not connect: ${e.message}` : "Could not connect." };
  }
}

export async function disconnectPartnerAction(formData: FormData) {
  const { seller } = await requireSeller();
  await disconnectPartner(seller.id, String(formData.get("provider")));
  revalidatePath("/seller/partners");
}

export async function startPartnerOAuthAction(formData: FormData) {
  await requireSeller();
  const provider = getProvider(String(formData.get("provider")));
  if (!provider.auth.oauth || !isOAuthAvailable(provider)) throw new Error("OAuth is not configured for this partner.");
  const state = randomToken(16);
  (await cookies()).set(`oauth_${provider.id}`, state, { httpOnly: true, secure: env.isProduction, sameSite: "lax", maxAge: 600, path: "/" });
  redirect(provider.auth.oauth.authorizeUrl(state, `${env.appUrl}/api/partners/oauth/${provider.id}`));
}

// ─── Listings ───────────────────────────────────────────────────────────────

export async function listingStatusAction(formData: FormData) {
  const { seller } = await requireSeller();
  const action = String(formData.get("action")) as "pause" | "activate" | "delete";
  try {
    await setListingStatusBySeller(seller.id, String(formData.get("listingId")), action);
  } catch (e) {
    if (e instanceof ListingError) redirect(`/seller/listings?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/seller/listings");
  if (action === "delete") redirect("/seller/listings");
}

export async function updateListingAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller } = await requireSeller();
  const id = String(formData.get("listingId"));
  const priceCents = parseMoneyToCents(String(formData.get("price") ?? ""));
  if (priceCents === null) return { ok: false, message: "Enter a price." };
  try {
    const res = await updateListingBasics(seller.id, id, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      priceCents,
      howMade: String(formData.get("howMade") ?? ""),
      aiTool: String(formData.get("aiTool") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
      inventory: formData.get("inventory") ? Number(formData.get("inventory")) : null,
      shippingCents: formData.get("shipping") ? parseMoneyToCents(String(formData.get("shipping"))) : null,
      deliverableAssetId: String(formData.get("deliverableAssetId") ?? "") || null,
    });
    revalidatePath(`/seller/listings/${id}`);
    if (res.review === "problems") return { ok: false, message: `Price and stock saved. The other changes need fixing first: ${res.problems.join(" ")}` };
    if (res.review === "pending") return { ok: true, message: "Saved. Your changes go live once a reviewer approves them; until then buyers see the approved version." };
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function submitForReviewAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller } = await requireSeller();
  const id = String(formData.get("listingId"));
  try {
    const res = await submitForReview(seller.id, id);
    revalidatePath(`/seller/listings/${id}`);
    if (res.missing.length) return { ok: false, message: `Finish setup first: ${res.missing.join(", ")}.` };
    if (res.problems.length) return { ok: false, message: res.problems.join(" ") };
    return { ok: true, message: res.status === "ACTIVE" ? "Published." : "Sent for review. We'll email you when it's approved." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not submit." };
  }
}

export async function counterNoticeAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller } = await requireSeller();
  const statement = String(formData.get("statement") ?? "").trim();
  if (statement.length < 40) return { ok: false, message: "Explain why you have the rights (at least a few sentences)." };
  try {
    await fileCounterNotice(seller.id, String(formData.get("listingId")), statement);
    return { ok: true, message: "Counter-notice sent. We'll review it and email you." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not send." };
  }
}

// ─── Orders ─────────────────────────────────────────────────────────────────

async function ownFulfillment(sellerId: string, fulfillmentId: string) {
  const f = await db.fulfillment.findUnique({ where: { id: fulfillmentId }, include: { sellerOrder: true } });
  if (!f || f.sellerOrder.sellerId !== sellerId) throw new Error("Not found");
  return f;
}

export async function addTrackingAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller } = await requireSeller();
  const carrier = String(formData.get("carrier") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  if (!carrier || number.length < 5) return { ok: false, message: "Enter the carrier and tracking number." };
  try {
    const f = await ownFulfillment(seller.id, String(formData.get("fulfillmentId")));
    await addSelfShipTracking(seller.id, f.id, { carrier, number, url: String(formData.get("url") ?? "").trim() || null });
    revalidatePath(`/seller/orders/${f.sellerOrderId}`);
    return { ok: true, message: "Marked as shipped. The buyer has been emailed." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save tracking." };
  }
}

export async function retryFulfillmentAction(formData: FormData) {
  const { seller } = await requireSeller();
  const f = await ownFulfillment(seller.id, String(formData.get("fulfillmentId")));
  await retryFulfillment(seller.id, f.id);
  revalidatePath(`/seller/orders/${f.sellerOrderId}`);
}

export async function simulateEventAction(formData: FormData) {
  const { seller } = await requireSeller();
  const f = await ownFulfillment(seller.id, String(formData.get("fulfillmentId")));
  await simulatePartnerEvent(f.id, String(formData.get("status")) as "IN_PRODUCTION" | "SHIPPED" | "DELIVERED" | "FAILED");
  revalidatePath(`/seller/orders/${f.sellerOrderId}`);
}

export async function sellerRefundAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller, user } = await requireSeller();
  const sellerOrderId = String(formData.get("sellerOrderId"));
  const so = await db.sellerOrder.findFirst({ where: { id: sellerOrderId, sellerId: seller.id } });
  if (!so) return { ok: false, message: "Order not found." };
  const amount = formData.get("amount") ? parseMoneyToCents(String(formData.get("amount"))) : null;
  const reason = String(formData.get("reason") ?? "").trim() || "Refunded by seller";
  try {
    const res = await applyRefund({ sellerOrderId, amountCents: amount ?? undefined, reason, source: "seller", actorId: user.id });
    revalidatePath(`/seller/orders/${sellerOrderId}`);
    return { ok: true, message: `Refunded $${(res.refundedCents / 100).toFixed(2)}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Refund failed." };
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function updateShopAction(_prev: Result, formData: FormData): Promise<Result> {
  const { seller } = await requireSeller();
  const parsed = z
    .object({ shopName: z.string().trim().min(2).max(60), location: z.string().trim().max(80), bio: z.string().trim().max(600) })
    .safeParse({ shopName: formData.get("shopName"), location: formData.get("location") ?? "", bio: formData.get("bio") ?? "" });
  if (!parsed.success) return { ok: false, message: "Check the shop name (2–60 characters)." };
  await db.seller.update({ where: { id: seller.id }, data: parsed.data });
  revalidatePath("/seller/settings");
  return { ok: true, message: "Saved." };
}
