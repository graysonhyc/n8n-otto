import { NextResponse } from "next/server";
import { getSlackInstall } from "@/lib/backoffice/store";
import { listSlackChannels } from "@/lib/slack/channels";

// Returns the live channels from the connected workspace, or connected:false
// so the owner picker can prompt to connect.
export async function GET() {
  const install = await getSlackInstall();
  if (!install) {
    return NextResponse.json({ connected: false, channels: [] });
  }
  try {
    const channels = await listSlackChannels(install.botToken);
    return NextResponse.json({ connected: true, channels });
  } catch {
    return NextResponse.json({ connected: false, channels: [] });
  }
}
