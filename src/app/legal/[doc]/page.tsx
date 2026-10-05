import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LEGAL } from "@/content/legal";
import { Container, Notice, PageBand } from "@/components/ui";

type Params = Promise<{ doc: string }>;

export function generateStaticParams() {
  return Object.keys(LEGAL).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: LEGAL[(await params).doc]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Params }) {
  const doc = LEGAL[(await params).doc];
  if (!doc) notFound();
  return (
    <>
      <div className="pt-6">
        <PageBand title={doc.title} sub={`Last updated ${doc.updated}`} />
      </div>
      <Container className="mt-12">
        <Notice tone="warn" title="Draft, pending legal review" className="mx-auto mb-10 max-w-[68ch]">
          This text describes how Latent.Market works today. It is not final legal advice and will be reviewed before launch.
        </Notice>
        <article className="prose-lm mx-auto">{doc.body}</article>
      </Container>
    </>
  );
}
