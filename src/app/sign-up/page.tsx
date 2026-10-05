import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { Container, PageBand } from "@/components/ui";
import { SignUpForm } from "../sign-in/AuthForms";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next = "/account" } = await searchParams;
  if (await currentUser()) redirect(next.startsWith("/") ? next : "/account");
  return (
    <>
      <div className="pt-6">
        <PageBand title="Create an account" sub="Track orders, download files and leave reviews." />
      </div>
      <Container className="mt-12 max-w-md">
        <SignUpForm next={next} />
      </Container>
    </>
  );
}
