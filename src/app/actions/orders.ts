"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { currentUser } from "@/server/session";
import { confirmDelivery } from "@/server/fulfillment";
import { createReview } from "@/server/trust";

async function canAccessOrder(orderId: string, token: string | null) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  const user = await currentUser();
  if (user && order.buyerId === user.id) return order;
  if (token && safeEqual(order.accessToken, token)) return order;
  return null;
}

export async function confirmDeliveryAction(formData: FormData) {
  const orderId = String(formData.get("orderId"));
  const sellerOrderId = String(formData.get("sellerOrderId"));
  const token = (formData.get("t") as string | null) ?? null;
  const order = await canAccessOrder(orderId, token);
  if (!order) throw new Error("Order not found");
  await confirmDelivery(orderId, sellerOrderId);
  revalidatePath(`/orders/${orderId}`);
}

export async function reviewAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in to leave a review." };
  try {
    await createReview(user.id, String(formData.get("orderItemId")), Number(formData.get("rating")), String(formData.get("body") ?? ""));
    revalidatePath(`/orders/${formData.get("orderId")}`);
    return { ok: true, message: "Thanks for your review!" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save your review." };
  }
}
