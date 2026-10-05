"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; message: string } | null;

/** A form bound to a server action that returns { ok, message }. */
export function ActionForm({
  action,
  children,
  className,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  size = "md",
  resetOnSuccess = false,
}: {
  action: (prev: Result, formData: FormData) => Promise<Result>;
  children?: ReactNode;
  className?: string;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "signal";
  size?: "sm" | "md" | "lg";
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("space-y-4", className)} key={resetOnSuccess && state?.ok ? state.message : undefined}>
      {children}
      {state ? (
        <p className={cn("text-[14px] font-semibold", state.ok ? "text-ok" : "text-danger")} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
