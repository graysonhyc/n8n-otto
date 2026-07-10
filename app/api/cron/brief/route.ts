import { NextResponse } from "next/server";
import { sendDailyBrief } from "@/lib/slack/send-brief";

// Vercel Cron hits this GET daily at 09:00 CEST (see vercel.json → 07:00 UTC).
// When CRON_SECRET is set, Vercel sends it as a Bearer token; we reject anything
// else so the endpoint can't be triggered by outsiders.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await sendDailyBrief();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ran: "daily-brief", ...result });
}
