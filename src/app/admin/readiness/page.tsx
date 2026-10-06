import type { Metadata } from "next";
import { LAUNCH, missingGates } from "@/config/launch";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { configChecks } from "@/lib/readiness";
import { ActionForm } from "@/components/ActionForm";
import { Pill, Table } from "@/components/ui";
import { probeStorageAction } from "../actions";

export const metadata: Metadata = { title: "Readiness · Admin" };
export const dynamic = "force-dynamic";

export default async function Readiness() {
  const checks = configChecks();
  const [adminsWithout2fa, mockLive, testSellerListings, legacyListings, deadJobs, unresolved] = await Promise.all([
    db.user.count({ where: { role: "ADMIN", twoFactorEnabledAt: null } }),
    db.listing.count({ where: { status: "ACTIVE", partnerConnection: { mock: true } } }),
    db.listing.count({ where: { status: "ACTIVE", seller: { isTest: true } } }),
    db.listingVersion.count({ where: { status: "APPROVED", checksPassed: false } }),
    db.job.count({ where: { status: "DEAD" } }),
    db.operation.count({ where: { status: "UNKNOWN" } }),
  ]);
  const dataChecks = [
    { label: "Every admin has two-step sign-in", ok: adminsWithout2fa === 0, detail: `${adminsWithout2fa} admin(s) not enrolled` },
    { label: "No live listing uses a demo partner connection", ok: mockLive === 0, detail: `${mockLive} listing(s)` },
    { label: "No live listing belongs to a seeded demo shop", ok: testSellerListings === 0, detail: `${testSellerListings} listing(s); hidden automatically in live mode` },
    { label: "Every live listing passed file checks", ok: legacyListings === 0, detail: `${legacyListings} listing(s) approved before checks existed; re-review them` },
    { label: "No background job has given up", ok: deadJobs === 0, detail: `${deadJobs} in the action queue` },
    { label: "No unconfirmed money operation", ok: unresolved === 0, detail: `${unresolved} in the action queue` },
  ];
  const gates = missingGates();

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-[24px]">Launch readiness</h2>
        <p className="max-w-2xl text-[14px] text-muted">
          Mode: <strong>{env.mode}</strong>. In live mode the server refuses to start while any blocking check fails. A passing check here is evidence the deployment is configured, not that a provider integration or legal setup has been verified; see docs/READINESS.md for the full status of each requirement.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Configuration</h3>
        <Table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.label}
                  {c.detail && !c.ok ? <span className="block text-[12.5px] text-muted">{c.detail}</span> : null}
                </td>
                <td>{c.ok ? <Pill tone="ok">ok</Pill> : <Pill tone={c.severity === "block" ? "danger" : "warn"}>{c.severity === "block" ? "blocks launch" : "warning"}</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Data</h3>
        <Table>
          <tbody>
            {dataChecks.map((c) => (
              <tr key={c.label}>
                <td>
                  {c.label}
                  {!c.ok ? <span className="block text-[12.5px] text-muted">{c.detail}</span> : null}
                </td>
                <td>{c.ok ? <Pill tone="ok">ok</Pill> : <Pill tone="warn">check</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Storage access</h3>
        <p className="text-[13.5px] text-muted">Writes a test file to each bucket and tries to read the private one without a signature. It must be refused.</p>
        <ActionForm action={probeStorageAction} submitLabel="Test bucket policies" pendingLabel="Testing…" variant="secondary" size="sm" />
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-[20px]">Launch decisions (src/config/launch.ts)</h3>
        <ul className="space-y-1 text-[14px]">
          <li>Seller signup: {LAUNCH.sellerSignup}</li>
          <li>
            Listing kinds:{" "}
            {Object.entries(LAUNCH.listingKinds)
              .filter(([, on]) => on)
              .map(([k]) => k.toLowerCase().replace("_", " "))
              .join(", ")}
          </li>
          <li>Several shops in one checkout: {LAUNCH.multiSellerCheckout ? "yes" : "no"}</li>
          <li>Buyers in: {LAUNCH.territory.buyerCountries.join(", ")}</li>
          <li>Human review of listings: {LAUNCH.moderation.requireReview ? "on" : "off"}</li>
          <li>AI studio: {LAUNCH.ai.enabled && LAUNCH.generationStudio ? `on, ${LAUNCH.ai.batchesPerSellerPerHour}/hour per seller, $${(LAUNCH.ai.platformDailyBudgetCents / 100).toFixed(2)}/day platform cap` : "off"}</li>
        </ul>
        <p className="text-[14px]">
          Sign-offs still missing:{" "}
          {gates.length ? gates.map((g) => <Pill key={g} tone="warn" className="mr-1">{g}</Pill>) : <Pill tone="ok">none</Pill>}
        </p>
      </section>
    </div>
  );
}
