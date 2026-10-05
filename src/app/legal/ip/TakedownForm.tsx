"use client";

import { useActionState } from "react";
import { Button, Checkbox, Field, Input, Notice, Textarea } from "@/components/ui";
import { takedownAction } from "./actions";

export function TakedownForm() {
  const [state, action, pending] = useActionState(takedownAction, null as null | { ok: boolean; message: string });
  if (state?.ok) return <Notice tone="ok" title="Thank you">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Link to the listing" htmlFor="listingUrl">
        <Input id="listingUrl" name="listingUrl" placeholder="https://latent.market/l/…" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your full name" htmlFor="claimantName">
          <Input id="claimantName" name="claimantName" autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="claimantEmail">
          <Input id="claimantEmail" name="claimantEmail" type="email" autoComplete="email" required />
        </Field>
      </div>
      <Field label="Postal address" htmlFor="claimantAddress">
        <Input id="claimantAddress" name="claimantAddress" autoComplete="street-address" />
      </Field>
      <Field label="Rights owner (you, or who you represent)" htmlFor="rightsOwner">
        <Input id="rightsOwner" name="rightsOwner" required />
      </Field>
      <Field label="The original work" htmlFor="workDescription" hint="What it is and where it can be seen (links help).">
        <Textarea id="workDescription" name="workDescription" required />
      </Field>
      <Field label="What the listing copies" htmlFor="infringementNote">
        <Textarea id="infringementNote" name="infringementNote" required />
      </Field>
      <Checkbox name="goodFaith" required label="I have a good-faith belief that the use described is not authorised by the rights owner, its agent, or the law." />
      <Checkbox name="accurate" required label="The information in this notice is accurate and, under penalty of perjury, I am the rights owner or authorised to act on their behalf." />
      <Field label="Signature (type your full name)" htmlFor="signature">
        <Input id="signature" name="signature" required />
      </Field>
      {state && !state.ok ? (
        <p className="text-[14px] text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send notice"}
      </Button>
    </form>
  );
}
