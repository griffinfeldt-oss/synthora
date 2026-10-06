import type { Metadata } from "next";
import { verifyEmailAction } from "@/app/actions/auth";
import { Button, ButtonLink, Container, Notice, PageBand } from "@/components/ui";

export const metadata: Metadata = { title: "Confirm your email" };

// The link only opens this page; the button does the confirming, so mail
// scanners that pre-open links cannot use up the token.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token, invalid } = await searchParams;
  return (
    <>
      <div className="pt-6">
        <PageBand title="Confirm your email" />
      </div>
      <Container className="mt-12 max-w-md space-y-6">
        {invalid || !token ? (
          <>
            <Notice tone="warn" title="This link has expired or was already used">
              Sign in and use “Send a new link” on your account page.
            </Notice>
            <ButtonLink href="/account" variant="secondary">
              Go to your account
            </ButtonLink>
          </>
        ) : (
          <form action={verifyEmailAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-muted">Confirming lets us link any orders you placed as a guest with this email, and lets you download your files from your account.</p>
            <Button type="submit" size="lg" className="w-full">
              Confirm my email
            </Button>
          </form>
        )}
      </Container>
    </>
  );
}
