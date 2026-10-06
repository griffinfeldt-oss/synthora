import type { Metadata } from "next";
import { forgotPasswordAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Container, Field, Input, PageBand } from "@/components/ui";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="pt-6">
        <PageBand title="Reset your password" sub="We'll email you a link that works for one hour." />
      </div>
      <Container className="mt-12 max-w-md">
        <ActionForm action={forgotPasswordAction} submitLabel="Email me a reset link" pendingLabel="Sending…">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
        </ActionForm>
      </Container>
    </>
  );
}
