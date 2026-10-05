import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Email outbox · Admin" };
export const dynamic = "force-dynamic";

export default async function Outbox() {
  const mails = await db.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-[24px]">Email outbox</h2>
      <p className="text-[14px] text-muted">Every email the platform sends. In demo mode (no RESEND_API_KEY) they are only stored here.</p>
      <ul className="space-y-3">
        {mails.map((m) => (
          <li key={m.id} className="border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{m.subject}</p>
              <span className="flex items-center gap-2 text-[12.5px] text-muted">
                to {m.to} · {formatDateTime(m.createdAt)} {m.error ? <Pill tone="danger">failed</Pill> : m.sentAt ? <Pill tone="ok">sent</Pill> : <Pill>stored</Pill>}
              </span>
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[13.5px] text-muted">{m.text}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
