"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, null as null | { message: string });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <p className="-mt-2 text-right text-[13px]">
        <Link href="/forgot-password" className="text-muted underline hover:text-ink">
          Forgot your password?
        </Link>
      </p>
      {state?.message ? (
        <p className="text-[14px] text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-[14px] text-muted">
        New here?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpAction, null as null | { message: string });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      {state?.message ? (
        <p className="text-[14px] text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-[12.5px] leading-relaxed text-muted">
        We&apos;ll email you a link to confirm your address. Orders you placed as a guest appear in your account once it&apos;s confirmed.
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted">
        By creating an account you agree to the <Link href="/legal/buyer-terms" className="underline">buyer terms</Link> and{" "}
        <Link href="/legal/privacy" className="underline">privacy policy</Link>.
      </p>
      <p className="text-center text-[14px] text-muted">
        Have an account?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
