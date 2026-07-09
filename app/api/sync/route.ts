import { NextResponse } from "next/server";
import { runSync } from "@/lib/data/sync";

// Re-fetch the instance, snapshot every workflow, and diff against the last
// snapshot to detect changes. (Slack health alerts are wired in Chunk 4.)
export async function POST() {
  const { scanned, changed } = await runSync();
  return NextResponse.json({ scanned, changed });
}
