import { after, NextResponse } from "next/server";
import { runNotifySweep } from "@/lib/slack/notify-run";

export const dynamic = "force-dynamic";

// n8n's Error Workflow POSTs here on any workflow failure. We don't trust the
// body — it's just a signal to run a full sweep (which re-reads live n8n data and
// posts any new attention items). Debounced so a workflow failing in a loop can't
// spam. Runs in after() so n8n's HTTP Request node isn't blocked by the sweep.
export async function POST(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const given = new URL(request.url).searchParams.get("secret") ?? request.headers.get("x-n8n-secret");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  after(async () => {
    await runNotifySweep({ debounceMs: 30_000 });
  });
  return NextResponse.json({ ok: true });
}
