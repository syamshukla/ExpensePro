import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { analyze, analysisEnabled } from "@/lib/analyze";
import type { Snapshot } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Tells the page whether to show the Analyze button.
export async function GET() {
  return NextResponse.json({ enabled: analysisEnabled() });
}

// Sends the numbers the page already has to Claude for categories and insights.
export async function POST(req: Request) {
  if (!analysisEnabled()) return NextResponse.json({ error: "Claude analysis is off. Set ANTHROPIC_API_KEY to turn it on." }, { status: 404 });
  try {
    const { snapshot, budget } = (await req.json()) as { snapshot: Snapshot; budget: number };
    if (!snapshot?.months?.length) return NextResponse.json({ error: "Pull your data first." }, { status: 400 });
    return NextResponse.json(await analyze(snapshot, Number(budget) || snapshot.budget));
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }, { status: 401 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Anthropic rate limit hit. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Anthropic API error ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
