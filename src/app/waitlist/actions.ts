"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  role: z.enum(["CREATOR", "BUYER"]),
  portfolio: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  source: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_-]*$/i)
    .optional()
    .catch(undefined),
});

export type WaitlistState = null | { ok: boolean; message: string };

export async function joinWaitlistAction(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  if (!(await hit("waitlist", await clientIp()))) return { ok: false, message: "Too many sign-ups from here. Try again in an hour." };
  // Bots fill every field; people never see this one.
  if (formData.get("website")) return { ok: true, message: "You're on the list." };
  const parsed = schema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    portfolio: formData.get("portfolio") || undefined,
    note: formData.get("note") || undefined,
    source: formData.get("source") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { email, role, portfolio, note, source } = parsed.data;
  if (role === "CREATOR" && !portfolio) return { ok: false, message: "Add your Instagram handle or a link to your work." };
  await db.waitlistSignup.upsert({
    where: { email_role: { email, role } },
    create: { email, role, portfolio, note, source },
    update: { portfolio, note },
  });
  return {
    ok: true,
    message:
      role === "CREATOR"
        ? "You're on the founding creator list. We'll look at your work and email you before we open."
        : "You're on the list. We'll email you once when the shop opens.",
  };
}
