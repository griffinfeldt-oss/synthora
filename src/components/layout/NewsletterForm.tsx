"use client";

import { useActionState } from "react";
import { subscribeAction } from "@/app/actions/newsletter";

export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeAction, null as null | { ok: boolean; message: string });
  if (state?.ok) return <p className="text-[14px] font-semibold text-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="flex w-full max-w-md">
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        name="email"
        type="email"
        required
        placeholder="Your email"
        className="h-12 min-w-0 flex-1 border border-line-strong bg-surface px-4 font-serif text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
      />
      <button disabled={pending} className="h-12 shrink-0 bg-ink px-6 text-[14px] font-semibold text-paper hover:bg-ink/85 disabled:opacity-60">
        {pending ? "…" : "Sign up"}
      </button>
      {state && !state.ok ? <p className="sr-only" role="alert">{state.message}</p> : null}
    </form>
  );
}
