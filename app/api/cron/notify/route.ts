import { NextResponse } from "next/server";
import { runNotifySweep } from "@/lib/slack/notify-run";

// Poll driver for real-time attention alerts. Daily on Hobby (see vercel.json);
// bump the schedule to */15 on Pro for true near-real-time. Guarded by
// CRON_SECRET the same way as the brief and escalate crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await runNotifySweep();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ran: "notify", ...result });
}
