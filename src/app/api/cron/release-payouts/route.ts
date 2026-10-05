// Daily: transfer sellers' money whose hold window has passed.
import { NextResponse } from "next/server";
import { releaseDuePayouts } from "@/server/payouts";
import { cronAuthorized } from "../auth";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await releaseDuePayouts());
}
