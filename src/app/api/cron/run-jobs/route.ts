// Every few minutes: run due background jobs, retry uncertain operations, and
// release checkouts that were never paid.
import { NextResponse } from "next/server";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runJobs } from "@/server/jobs";
import { expireStaleCheckouts } from "@/server/orders";
import { recoverOperations } from "@/server/resolution";
import { cronAuthorized } from "../auth";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await runJobs({ limit: 50 });
  const operations = await recoverOperations();
  const expired = await expireStaleCheckouts();
  const pruned = new Date().getMinutes() < 5 ? await pruneRateLimits() : 0;
  return NextResponse.json({ jobs, operations, expiredCheckouts: expired, prunedRateLimits: pruned });
}
