// Hourly safety net: poll partners for orders whose webhooks may have been missed.
import { NextResponse } from "next/server";
import { syncActiveFulfillments } from "@/server/fulfillment";
import { cronAuthorized } from "../auth";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ updated: await syncActiveFulfillments() });
}
