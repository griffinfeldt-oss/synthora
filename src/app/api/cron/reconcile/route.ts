// Daily: compare the ledger with Stripe; halt payouts for sellers with differences.
import { NextResponse } from "next/server";
import { runReconciliation } from "@/server/reconcile";
import { cronAuthorized } from "../auth";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await runReconciliation();
  return NextResponse.json({ id: run.id, status: run.status, checked: run.checked, halted: run.haltedSellerIds.length });
}
