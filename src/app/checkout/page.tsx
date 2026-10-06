import type { Metadata } from "next";
import { LAUNCH } from "@/config/launch";
import { currentUser } from "@/server/session";
import { Container, PageBand } from "@/components/ui";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await currentUser();
  return (
    <>
      <div className="pt-6">
        <PageBand title="Checkout" sub={user ? undefined : "No account needed. You can create one after paying to track orders in one place."} />
      </div>
      <Container className="mt-12">
        <CheckoutForm defaultEmail={user?.email ?? ""} defaultName={user?.name ?? ""} countries={LAUNCH.territory.buyerCountries} />
      </Container>
    </>
  );
}
