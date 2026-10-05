import type { Metadata } from "next";
import { productType } from "@/config/catalog";
import { db } from "@/lib/db";
import { mock } from "@/lib/env";
import { isOAuthAvailable, providers } from "@/fulfillment/registry";
import { connectionWebhookUrl } from "@/fulfillment/webhook-url";
import { requireSeller } from "@/server/session";
import { ActionForm } from "@/components/ActionForm";
import { Button, Field, Input, Notice, Pill } from "@/components/ui";
import { connectPartnerAction, disconnectPartnerAction, setFulfillmentOptionAction, startPartnerOAuthAction } from "../actions";

export const metadata: Metadata = { title: "Fulfillment partners" };
export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const { seller } = await requireSeller();
  const connections = await db.partnerConnection.findMany({ where: { sellerId: seller.id } });
  const demoAllowed = mock.stripe || mock.fulfillment;
  const builtIns = providers.filter((p) => p.kind !== "pod");
  const partners = providers.filter((p) => p.kind === "pod");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-[24px]">How you fulfil orders</h2>
        <p className="mt-1 max-w-2xl text-[14.5px] text-muted">
          Choose per listing. Partner orders are placed in <strong>your own</strong> partner account and billed to you by the partner; Latent.Market never pays partner bills. Keys are encrypted at rest.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {builtIns.map((p) => {
          const on = p.id === "self" ? seller.offersSelfShip : seller.offersDigital;
          return (
            <div key={p.id} className="flex flex-col justify-between gap-4 border border-line bg-surface p-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-[20px]">{p.name}</h3>
                  {on ? <Pill tone="ok">On</Pill> : <Pill>Off</Pill>}
                </div>
                <p className="mt-1 text-[14px] text-muted">{p.tagline}</p>
              </div>
              <form action={setFulfillmentOptionAction}>
                <input type="hidden" name="option" value={p.id} />
                <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                <Button size="sm" variant={on ? "secondary" : "primary"}>
                  {on ? "Turn off" : "Turn on"}
                </Button>
              </form>
            </div>
          );
        })}
      </section>

      <section className="space-y-4">
        <h3 className="font-serif text-[22px]">Print-on-demand partners</h3>
        {partners.map((p) => {
          const c = connections.find((x) => x.provider === p.id && x.status !== "REVOKED");
          return (
            <div key={p.id} className="border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-serif text-[20px]">{p.name}</h4>
                  <p className="text-[14px] text-muted">{p.tagline}</p>
                  <p className="mt-1 text-[12.5px] text-muted">Makes: {p.productTypes.map((t) => productType(t).label).join(", ")}</p>
                </div>
                {c ? (
                  <div className="flex items-center gap-2">
                    <Pill tone={c.status === "ACTIVE" ? "ok" : "danger"}>{c.mock ? "Demo connection" : c.status === "ACTIVE" ? "Connected" : "Error"}</Pill>
                  </div>
                ) : null}
              </div>
              {c ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="text-[14px]">
                    {c.accountLabel}
                    {c.externalShopId ? <span className="text-muted"> · shop {c.externalShopId}</span> : null}
                    {c.lastError ? <span className="block text-[13px] text-danger">{c.lastError}</span> : null}
                  </p>
                  <form action={disconnectPartnerAction}>
                    <input type="hidden" name="provider" value={p.id} />
                    <Button size="sm" variant="ghost" className="text-danger">
                      Disconnect
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="mt-4 grid gap-6 border-t border-line pt-4 lg:grid-cols-[1fr_auto]">
                  <ActionForm action={connectPartnerAction} submitLabel={`Connect ${p.name}`} pendingLabel="Checking key…" size="sm">
                    <input type="hidden" name="provider" value={p.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(p.auth.fields ?? []).map((f) => (
                        <Field key={f.key} label={`${f.label}${f.optional ? " (optional)" : ""}`} htmlFor={`${p.id}-${f.key}`} hint={f.help}>
                          <Input id={`${p.id}-${f.key}`} name={f.key} type={f.secret ? "password" : "text"} autoComplete="off" required={!f.optional} />
                        </Field>
                      ))}
                    </div>
                    {p.auth.keyHelpUrl ? (
                      <p className="text-[12.5px] text-muted">
                        <a href={p.auth.keyHelpUrl} target="_blank" rel="noreferrer" className="underline">
                          Where do I find this?
                        </a>
                      </p>
                    ) : null}
                  </ActionForm>
                  <div className="flex flex-col gap-2 lg:w-56">
                    {isOAuthAvailable(p) ? (
                      <form action={startPartnerOAuthAction}>
                        <input type="hidden" name="provider" value={p.id} />
                        <Button size="sm" variant="secondary" className="w-full">
                          Sign in with {p.name}
                        </Button>
                      </form>
                    ) : null}
                    {demoAllowed ? (
                      <ActionForm action={connectPartnerAction} submitLabel="Use a demo connection" variant="secondary" size="sm">
                        <input type="hidden" name="provider" value={p.id} />
                        <input type="hidden" name="demo" value="true" />
                        <p className="text-[12.5px] text-muted">No account needed. Orders are simulated.</p>
                      </ActionForm>
                    ) : null}
                  </div>
                </div>
              )}
              {c && !c.mock && p.id === "gelato" ? (
                <Notice className="mt-4" title="One more step for tracking updates">
                  In the Gelato dashboard → Developer → Webhooks, add this URL for the &ldquo;order status updated&rdquo; and &ldquo;tracking code updated&rdquo; events. It only works for your account.
                  <code className="mt-2 block break-all bg-surface-2 p-2 text-[12px]">{connectionWebhookUrl(p.id, c.id)}</code>
                </Notice>
              ) : null}
            </div>
          );
        })}
      </section>
      <p className="text-[13px] text-muted">Adding a new partner is one adapter file in <code>src/fulfillment/adapters</code>; it appears here automatically.</p>
    </div>
  );
}
