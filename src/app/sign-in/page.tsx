import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { googleSignInAction } from "@/app/actions/auth";
import { currentUser } from "@/server/session";
import { Button, Container, Notice, PageBand } from "@/components/ui";
import { SignInForm } from "./AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next = "/account", reset } = await searchParams;
  if (await currentUser()) redirect(next.startsWith("/") ? next : "/account");
  return (
    <>
      <div className="pt-6">
        <PageBand title="Sign in" />
      </div>
      <Container className="mt-12 max-w-md">
        {reset ? (
          <Notice tone="ok" title="Password changed" className="mb-6">
            Sign in with your new password. Other sessions were signed out.
          </Notice>
        ) : null}
        <SignInForm next={next} />
        {googleEnabled ? (
          <form action={googleSignInAction} className="mt-4">
            <input type="hidden" name="next" value={next} />
            <Button variant="secondary" size="lg" className="w-full">
              Continue with Google
            </Button>
          </form>
        ) : null}
      </Container>
    </>
  );
}
