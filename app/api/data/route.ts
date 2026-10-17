import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the Gmail pull engine and returns fresh numbers. The page keeps the last
// result on each device, so this only runs when you press "Pull latest" (or the
// saved copy is more than 6 hours old).
export async function POST() {
  try {
    return NextResponse.json(await buildSnapshot());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
