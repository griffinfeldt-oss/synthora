"use server";

import { z } from "zod";
import { clientIp, hit } from "@/lib/rate-limit";
import { currentUser } from "@/server/session";
import { createReport } from "@/server/trust";

const schema = z.object({
  listingId: z.string().min(1),
  reason: z.enum(["NOT_AI_MADE", "IP_INFRINGEMENT", "PROHIBITED_ITEM", "MISLEADING", "OFFENSIVE", "SCAM", "OTHER"]),
  details: z.string().trim().min(10, "Please add a little more detail.").max(2000),
  email: z.string().email().optional(),
});

export async function reportListingAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!(await hit("report", user?.id ?? (await clientIp())))) return { ok: false, message: "You've sent a lot of reports. Try again later." };
  const parsed = schema.safeParse({
    listingId: formData.get("listingId"),
    reason: formData.get("reason"),
    details: formData.get("details"),
    email: user ? undefined : formData.get("email") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!user && !parsed.data.email) return { ok: false, message: "Add your email so we can follow up." };
  await createReport({
    listingId: parsed.data.listingId,
    reason: parsed.data.reason,
    details: parsed.data.details,
    reporterId: user?.id ?? null,
    email: user?.email ?? parsed.data.email ?? null,
  });
  return { ok: true, message: "Thanks. Our team reviews every report, usually within one business day." };
}
