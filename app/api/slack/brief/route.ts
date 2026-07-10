import { NextResponse } from "next/server";
import { sendDailyBrief } from "@/lib/slack/send-brief";

// Manual trigger — the "Send to Slack" action in the app.
export async function POST() {
  const result = await sendDailyBrief();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ channel: result.channel, posted: result.posted, routed: result.routed });
}
