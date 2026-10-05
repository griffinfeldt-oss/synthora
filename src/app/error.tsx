"use client";

import { Button, Container } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="mt-24 max-w-xl text-center">
      <h1 className="font-serif text-[36px]">Something went wrong</h1>
      <p className="mt-3 text-muted">Please try again. If it keeps happening, email help@latent.market.</p>
      <Button onClick={reset} className="mt-8">
        Try again
      </Button>
    </Container>
  );
}
