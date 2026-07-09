import { NextResponse } from "next/server";
import { getAllOwners, getSlackInstall } from "@/lib/backoffice/store";
import { loadBrief } from "@/lib/data/brief";
import { getMasterChannelId, postBlocks } from "@/lib/slack/post";
import { resolveRouting } from "@/lib/slack/route";
import { briefDigestBlocks, briefItemBlocks } from "@/lib/slack/blocks";

// Posts the Brief digest to #n8n-backoffice, then routes each item to its
// owner's channel (falling back to the master channel when unassigned).
export async function POST() {
  const install = await getSlackInstall();
  if (!install) {
    return NextResponse.json({ error: "Slack not connected" }, { status: 400 });
  }

  const master = await getMasterChannelId(install.botToken);
  if (!master) {
    return NextResponse.json(
      { error: "Could not find #n8n-backoffice channel" },
      { status: 400 },
    );
  }

  const [{ items }, owners] = await Promise.all([loadBrief(), getAllOwners()]);

  await postBlocks(install.botToken, master, briefDigestBlocks(items), "Backoffice Brief");

  let routed = 0;
  for (const item of items) {
    if (!item.workflowId) continue;
    const routing = resolveRouting(owners.get(item.workflowId) ?? null, master);
    const note = routing.routedByOwner
      ? `↳ routed to ${routing.channelName ?? "owner channel"} because ${item.suggestedOwner} owns this`
      : "↳ no owner assigned — posted to #n8n-backoffice";
    await postBlocks(
      install.botToken,
      routing.channelId,
      briefItemBlocks(item, note),
      item.title,
    );
    routed++;
  }

  return NextResponse.json({ channel: "#n8n-backoffice", posted: items.length, routed });
}
