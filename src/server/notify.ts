import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";

interface Note {
  type: string;
  title: string;
  body: string;
  href?: string;
  email?: boolean;
}

/** In-app notification plus (by default) an email. */
export async function notifyUser(userId: string, note: Note): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  await db.notification.create({
    data: { userId, type: note.type, title: note.title, body: note.body, href: note.href },
  });
  if (note.email !== false) {
    await sendEmail({
      to: user.email,
      subject: note.title,
      text: `${note.body}${note.href ? `\n\n${env.appUrl}${note.href}` : ""}\n\n— Latent.Market`,
    });
  }
}

export async function notifySeller(sellerId: string, note: Note): Promise<void> {
  const seller = await db.seller.findUnique({ where: { id: sellerId }, select: { userId: true } });
  if (seller) await notifyUser(seller.userId, note);
}

/** Buyers may check out as guests, so orders notify by email and, if signed in, in-app. */
export async function notifyBuyer(
  order: { email: string; buyerId: string | null; id: string; accessToken: string },
  note: Omit<Note, "href">,
): Promise<void> {
  const href = `/orders/${order.id}?t=${order.accessToken}`;
  if (order.buyerId) {
    await notifyUser(order.buyerId, { ...note, href });
  } else {
    await sendEmail({ to: order.email, subject: note.title, text: `${note.body}\n\n${env.appUrl}${href}\n\n— Latent.Market` });
  }
}

export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await db.auditLog.create({ data: { actorId, action, targetType, targetId, meta: meta as object | undefined } });
}
