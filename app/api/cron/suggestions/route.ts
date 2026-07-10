import { NextResponse } from "next/server";
import { runSuggestionSweep } from "@/lib/slack/suggestion-run";

// Posts newly-detected SOP suggestions to Slack. Guarded by CRON_SECRET the same
// way as the brief, notify, and escalate crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await runSuggestionSweep();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ran: "suggestions", ...result });
}
