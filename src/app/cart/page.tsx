import type { Metadata } from "next";
import { Container, PageBand } from "@/components/ui";
import { CartView } from "./CartView";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <div className="pt-6">
        <PageBand title="Your cart" />
      </div>
      <Container className="mt-12">
        <CartView canceled={sp.canceled === "1"} />
      </Container>
    </>
  );
}
