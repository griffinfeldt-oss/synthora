"use server";

import { z } from "zod";
import { submitTakedown } from "@/server/trust";

const schema = z.object({
  listingUrl: z.string().trim().min(5, "Paste the listing link").max(500),
  claimantName: z.string().trim().min(2, "Your name is required").max(120),
  claimantEmail: z.string().trim().email("A valid email is required"),
  claimantAddress: z.string().trim().max(300).optional(),
  rightsOwner: z.string().trim().min(2, "Who owns the rights?").max(200),
  workDescription: z.string().trim().min(10, "Describe the original work").max(3000),
  infringementNote: z.string().trim().min(10, "Explain what is copied").max(3000),
  goodFaith: z.literal("on", { message: "The good-faith statement is required" }),
  accurate: z.literal("on", { message: "The accuracy statement is required" }),
  signature: z.string().trim().min(2, "Type your full name as a signature").max(120),
});

export async function takedownAction(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const t = await submitTakedown({ ...parsed.data, goodFaith: true, accurate: true });
  return { ok: true, message: `Notice received (reference ${t.id}). We review notices within 2 business days and will email you.` };
}
