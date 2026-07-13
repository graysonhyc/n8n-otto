import "server-only";
import { getSlackInstall } from "@/lib/backoffice/store";
import { loadChannelBriefs } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks, teamBriefBlocks } from "@/lib/slack/blocks";

export type SendBriefResult =
  | { ok: false; status: number; error: string }
  | { ok: true; channels: number; posted: number };

// Attention items that make sense to file as a Linear ticket: incidents (recent
// failures) and behaviour changes. Ownership/hygiene/shared-resource items are
// fixed in n8n or the registry, not via a ticket, so they are summarised in the
// stats/insights rather than posted as ticket cards.
const TICKET_CATEGORIES = new Set(["incident", "change"]);

// Posts one team's daily brief per Slack channel: a deterministic estate-stats
// card (active/archived/errors/runs + insights), then highlights the issues
// worth filing as Linear tickets as interactive cards (each carries a "Create
// Linear ticket" button handled by the interactivity route). Workflows with no
// owner channel fall back to SLACK_MASTER_CHANNEL_ID (the catch-all ops channel)
// via loadChannelBriefs; only when that is unset too are they skipped. Shared by
// the manual "Send to Slack" action and the morning cron.
export async function sendDailyBrief(): Promise<SendBriefResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const { channels } = await loadChannelBriefs();

  let posted = 0;
  for (const ch of channels) {
    const teamName = ch.channelName ?? "Unassigned / Ops";
    await postBlocks(
      install.botToken,
      ch.channelId,
      teamBriefBlocks(teamName, ch.stats),
      `${teamName} — Daily Brief`,
    );

    const candidates = ch.attention.filter((a) => TICKET_CATEGORIES.has(a.category));
    if (candidates.length === 0) {
      await postBlocks(
        install.botToken,
        ch.channelId,
        [
          {
            type: "section",
            text: { type: "mrkdwn", text: "✅ Nothing to file as a Linear ticket today." },
          },
        ],
        "No ticket-worthy issues",
      );
      continue;
    }

    await postBlocks(
      install.botToken,
      ch.channelId,
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🎫 *${candidates.length} issue${candidates.length === 1 ? "" : "s"} you can file as a Linear ticket*`,
          },
        },
      ],
      "Issues to file as Linear tickets",
    );
    for (const item of candidates) {
      await postBlocks(install.botToken, ch.channelId, briefItemBlocks(item), item.title);
      posted++;
    }
  }

  return { ok: true, channels: channels.length, posted };
}
