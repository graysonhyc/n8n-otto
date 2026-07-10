import { NextResponse } from "next/server";
import { escalateUnacked } from "@/lib/slack/escalate";

// Vercel Cron hits this GET daily (a few hours after the brief). Guarded by
// CRON_SECRET the same way as the brief cron. Re-pings unacknowledged
// high-severity items to owner escalation channels.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await escalateUnacked();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ran: "escalate", ...result });
}
