/**
 * Outgoing email. Every message is recorded in EmailOutbox (visible to admins);
 * when RESEND_API_KEY is set it is also delivered through Resend.
 */
import "server-only";
import { db } from "./db";
import { env, mock } from "./env";

export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<void> {
  const row = await db.emailOutbox.create({
    data: { to: input.to, subject: input.subject, text: input.text, provider: mock.email ? "outbox" : "resend" },
  });
  if (mock.email) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    await db.emailOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
  } catch (e) {
    await db.emailOutbox.update({
      where: { id: row.id },
      data: { error: e instanceof Error ? e.message.slice(0, 500) : "send failed" },
    });
  }
}
