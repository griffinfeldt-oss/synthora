import Link from "next/link";
import { requireUser } from "@/server/session";
import { Container, Pill } from "@/components/ui";
import { SellerNav } from "./SellerNav";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/seller");
  const seller = user.seller;
  return (
    <Container className="mt-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Seller dashboard</p>
          <h1 className="mt-1 font-serif text-[30px]">{seller?.shopName ?? "Open your shop"}</h1>
        </div>
        {seller ? (
          <div className="flex items-center gap-3">
            {seller.status === "PENDING" ? <Pill tone="warn">Awaiting approval</Pill> : seller.status === "SUSPENDED" ? <Pill tone="danger">Suspended</Pill> : <Pill tone="ok">Live</Pill>}
            {seller.status === "APPROVED" ? (
              <Link href={`/s/${seller.slug}`} className="text-[13px] font-semibold underline">
                View shop
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      {seller ? (
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <SellerNav />
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </Container>
  );
}
