import { requireAdmin } from "@/server/session";
import { Container } from "@/components/ui";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <Container className="mt-8">
      <div className="mb-8 border-b border-line pb-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-[30px]">Marketplace operations</h1>
      </div>
      <div className="grid gap-8 lg:grid-cols-[190px_1fr]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
