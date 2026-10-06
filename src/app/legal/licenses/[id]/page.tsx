import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Container, PageBand } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const l = await db.licenseVersion.findUnique({ where: { id: (await params).id } });
  return { title: l ? `${l.name} licence (v${l.version})` : "Licence" };
}

/** The exact licence text a buyer agrees to. Old versions stay published for past buyers. */
export default async function LicensePage({ params }: { params: Promise<{ id: string }> }) {
  const l = await db.licenseVersion.findUnique({ where: { id: (await params).id } });
  if (!l) notFound();
  return (
    <>
      <div className="pt-6">
        <PageBand title={`${l.name} licence`} sub={`Version ${l.version} · published ${formatDate(l.createdAt)}`} />
      </div>
      <Container className="mt-12 max-w-2xl space-y-4">
        <p className="font-semibold">{l.summary}</p>
        {l.body.split("\n\n").map((para, i) => (
          <p key={i} className="leading-relaxed text-muted">
            {para}
          </p>
        ))}
      </Container>
    </>
  );
}
