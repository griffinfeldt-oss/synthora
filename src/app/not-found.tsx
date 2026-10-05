import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="mt-24 max-w-xl text-center">
      <p className="font-serif text-[15px] italic text-signal">404</p>
      <h1 className="mt-2 font-serif text-[40px]">Not in the latent space</h1>
      <p className="mt-3 text-muted">This page doesn&apos;t exist, or the listing is no longer available.</p>
      <ButtonLink href="/shop" className="mt-8">
        Browse the shop
      </ButtonLink>
    </Container>
  );
}
