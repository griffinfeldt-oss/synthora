"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import { joinWaitlistAction, type WaitlistState } from "./actions";

export function WaitlistForm({ source }: { source?: string }) {
  const [state, action, pending] = useActionState(joinWaitlistAction, null as WaitlistState);
  const [role, setRole] = useState<"CREATOR" | "BUYER">("CREATOR");
  if (state?.ok) return <Notice tone="ok" title="Thank you">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">I want to</legend>
        <div className="grid grid-cols-2 gap-px border border-line bg-line">
          {(
            [
              ["CREATOR", "Sell what I make with AI"],
              ["BUYER", "Shop AI-made goods"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`cursor-pointer p-4 text-[14px] ${role === value ? "bg-ink text-surface" : "bg-surface"}`}>
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {role === "CREATOR" ? (
        <>
          <Field label="Where can we see your work?" htmlFor="portfolio" hint="Your Instagram handle or any link.">
            <Input id="portfolio" name="portfolio" placeholder="@yourhandle" required />
          </Field>
          <Field label="What would you sell? (optional)" htmlFor="note" hint="Prints, shirts, stickers, digital files…">
            <Textarea id="note" name="note" rows={3} maxLength={500} />
          </Field>
        </>
      ) : (
        <Field label="What would you shop for? (optional)" htmlFor="note">
          <Textarea id="note" name="note" rows={3} maxLength={500} />
        </Field>
      )}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {source ? <input type="hidden" name="source" value={source} /> : null}
      {state && !state.ok ? (
        <p className="text-[14px] text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Joining…" : role === "CREATOR" ? "Apply as a founding creator" : "Join the waitlist"}
      </Button>
      <p className="text-[12.5px] text-muted">We only use your email to tell you about Synthora opening. No spam, and you can ask us to delete it anytime.</p>
    </form>
  );
}
