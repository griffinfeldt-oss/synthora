import type { Metadata } from "next";
import { resetPasswordAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { ButtonLink, Container, Field, Input, Notice, PageBand } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  return (
    <>
      <div className="pt-6">
        <PageBand title="Choose a new password" sub="This signs you out everywhere else." />
      </div>
      <Container className="mt-12 max-w-md">
        {token ? (
          <ActionForm action={resetPasswordAction} submitLabel="Save new password" pendingLabel="Saving…">
            <input type="hidden" name="token" value={token} />
            <Field label="New password" htmlFor="password" hint="At least 10 characters.">
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Type it again" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
          </ActionForm>
        ) : (
          <div className="space-y-4">
            <Notice tone="warn" title="This link is missing its code">
              Ask for a new reset link.
            </Notice>
            <ButtonLink href="/forgot-password" variant="secondary">
              Reset password
            </ButtonLink>
          </div>
        )}
      </Container>
    </>
  );
}
