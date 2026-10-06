import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BRAND } from "@/config/brand";
import { twoFactorAction } from "@/app/actions/auth";
import { otpauthUri } from "@/lib/totp";
import { pendingTotpSecret } from "@/server/identity";
import { isAdmin, requireUser } from "@/server/session";
import { ActionForm } from "@/components/ActionForm";
import { Container, Field, Input, Notice, PageBand } from "@/components/ui";

export const metadata: Metadata = { title: "Two-step sign-in" };
export const dynamic = "force-dynamic";

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next = "/admin" } = await searchParams;
  const user = await requireUser(`/two-factor?next=${encodeURIComponent(next)}`);
  if (!isAdmin(user)) redirect("/");
  const secret = await pendingTotpSecret(user);
  const grouped = secret?.match(/.{1,4}/g)?.join(" ");

  return (
    <>
      <div className="pt-6">
        <PageBand title="Two-step sign-in" sub="Admin pages need a code from your authenticator app." />
      </div>
      <Container className="mt-12 max-w-lg space-y-6">
        {secret ? (
          <Notice title="Set up your authenticator (one time)">
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px]">
              <li>Open an authenticator app (1Password, Google Authenticator, Authy…) and add an account.</li>
              <li>
                Choose “enter a setup key” and type this key:
                <code className="mt-1 block select-all break-all bg-surface-2 px-2 py-1.5 font-mono text-[15px] tracking-wider">{grouped}</code>
                Or on this device:{" "}
                <a className="underline" href={otpauthUri(secret, user.email, BRAND.name)}>
                  open in authenticator
                </a>
                .
              </li>
              <li>Enter the 6-digit code it shows. This key is shown only until you confirm it.</li>
            </ol>
          </Notice>
        ) : null}
        <ActionForm action={twoFactorAction} submitLabel={secret ? "Confirm and continue" : "Continue"} pendingLabel="Checking…">
          <input type="hidden" name="next" value={next.startsWith("/") ? next : "/admin"} />
          <Field label="6-digit code" htmlFor="code">
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
          </Field>
        </ActionForm>
        <p className="text-[13px] text-muted">Lost your device? Another admin can reset it with <code>npm run admin:reset-2fa -- you@example.com</code>.</p>
      </Container>
    </>
  );
}
