"use server";

import { z } from "zod";
import { db } from "@/lib/db";

export async function subscribeAction(_prev: unknown, formData: FormData) {
  const parsed = z.string().email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { ok: false, message: "Enter a valid email." };
  await db.subscriber.upsert({ where: { email: parsed.data }, create: { email: parsed.data }, update: {} });
  return { ok: true, message: "You're on the list. New drops, once a month." };
}
