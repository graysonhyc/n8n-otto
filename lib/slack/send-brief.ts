import "server-only";
import { getAllOwners, getSlackInstall } from "@/lib/backoffice/store";
import { loadDailyBrief } from "@/lib/data/brief";
import { getMasterChannelId, postBlocks } from "@/lib/slack/post";
import { resolveRouting } from "@/lib/slack/route";
import { dailyBriefBlocks, briefItemBlocks } from "@/lib/slack/blocks";

export type SendBriefResult =
  | { ok: false; status: number; error: string }
  | { ok: true; channel: string; posted: number; routed: number };

// Posts the daily team brief (Yesterday recap · Today look-ahead · Explore next)
// to #n8n-backoffice, then routes each attention item to its owner's channel,
// falling back to the master channel when a workflow is unassigned. Shared by
// the manual "Send to Slack" action and the 09:00 CEST cron.
export async function sendDailyBrief(): Promise<SendBriefResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const master = await getMasterChannelId(install.botToken);
  if (!master) return { ok: false, status: 400, error: "Could not find #n8n-backoffice channel" };

  const [{ daily, attention }, owners] = await Promise.all([loadDailyBrief(), getAllOwners()]);

  await postBlocks(install.botToken, master, dailyBriefBlocks(daily), "n8n Backoffice — Daily Brief");

  let routed = 0;
  for (const item of attention) {
    if (!item.workflowId) continue;
    const routing = resolveRouting(owners.get(item.workflowId) ?? null, master);
    const note = routing.routedByOwner
      ? `↳ routed to ${routing.channelName ?? "owner channel"} because ${item.suggestedOwner} owns this`
      : "↳ no owner assigned — posted to #n8n-backoffice";
    await postBlocks(install.botToken, routing.channelId, briefItemBlocks(item, note), item.title);
    routed++;
  }

  return { ok: true, channel: "#n8n-backoffice", posted: attention.length, routed };
}
