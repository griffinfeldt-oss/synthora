"use client";

import { useActionState, useState } from "react";
import { reviewAction } from "@/app/actions/orders";
import { Button, Textarea } from "@/components/ui";

export function ReviewForm({ orderId, orderItemId }: { orderId: string; orderItemId: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [state, action, pending] = useActionState(reviewAction, null as null | { ok: boolean; message: string });
  if (state?.ok) return <p className="mt-2 text-[13px] font-semibold text-ok" role="status">{state.message}</p>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[13px] font-semibold underline">
        Leave a review
      </button>
    );
  return (
    <form action={action} className="mt-3 max-w-md space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset>
        <legend className="text-[13px] font-semibold">Your rating</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-pressed={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className={`grid size-9 place-items-center border text-[15px] ${n <= rating ? "border-ink bg-ink text-paper" : "border-line-strong"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`review-${orderItemId}`} className="sr-only">
        Review
      </label>
      <Textarea id={`review-${orderItemId}`} name="body" required minLength={5} maxLength={2000} placeholder="How is it in person?" />
      {state && !state.ok ? <p className="text-[13px] text-danger" role="alert">{state.message}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Post review"}
      </Button>
    </form>
  );
}
