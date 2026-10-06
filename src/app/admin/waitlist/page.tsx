import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Stat, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Waitlist · Admin" };
export const dynamic = "force-dynamic";

/** Pre-launch sign-ups from /waitlist. Creators first: they are the founding-creator shortlist. */
export default async function Waitlist() {
  const [signups, creators, buyers, sources] = await Promise.all([
    db.waitlistSignup.findMany({ orderBy: [{ role: "asc" }, { createdAt: "desc" }], take: 500 }),
    db.waitlistSignup.count({ where: { role: "CREATOR" } }),
    db.waitlistSignup.count({ where: { role: "BUYER" } }),
    db.waitlistSignup.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-[24px]">Waitlist</h2>
        <p className="max-w-2xl text-[14px] text-muted">
          Sign-ups from /waitlist. Share it as /waitlist?ref=ig-bio (or any short tag) to see which posts bring people in.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Creators" value={creators} />
        <Stat label="Shoppers" value={buyers} />
        <Stat
          label="Top source"
          value={sources.sort((a, b) => b._count._all - a._count._all)[0]?.source ?? "–"}
          hint={sources.map((s) => `${s.source ?? "direct"}: ${s._count._all}`).join(" · ") || undefined}
        />
      </div>
      <Table>
        <thead>
          <tr>
            <th>Who</th>
            <th>Email</th>
            <th>Work</th>
            <th>Note</th>
            <th>Source</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {signups.map((s) => (
            <tr key={s.id}>
              <td>{s.role === "CREATOR" ? "Creator" : "Shopper"}</td>
              <td>{s.email}</td>
              <td>{s.portfolio ?? "–"}</td>
              <td className="max-w-[280px] text-[13px] text-muted">{s.note ?? ""}</td>
              <td>{s.source ?? "direct"}</td>
              <td className="whitespace-nowrap text-[13px]">{formatDateTime(s.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
