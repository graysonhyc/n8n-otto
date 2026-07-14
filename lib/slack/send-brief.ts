import "server-only";
import { getSlackInstall } from "@/lib/backoffice/store";
import { loadChannelBriefs } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks, teamBriefBlocks } from "@/lib/slack/blocks";

export type SendBriefResult =
  | { ok: false; status: number; error: string }
  | { ok: true; channels: number; posted: number };

// Posts one team's daily brief per Slack channel: a deterministic estate-stats
// card (active/archived/errors/runs + insights), then EVERY open attention item
// for that team as its own interactive card (each carries the relevant actions —
// Assign owner, Create Linear ticket, etc. — handled by the interactivity
// route). Workflows with no owner channel fall back to SLACK_MASTER_CHANNEL_ID
// (the catch-all ops channel) via loadChannelBriefs; only when that is unset too
// are they skipped. Shared by the manual "Send to Slack" action and the morning
// cron, so the issues always go out with the brief.
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

    const candidates = ch.attention;
    if (candidates.length === 0) {
      await postBlocks(
        install.botToken,
        ch.channelId,
        [
          {
            type: "section",
            text: { type: "mrkdwn", text: "✅ Nothing needs attention today." },
          },
        ],
        "No open issues",
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
            text: `⚠️ *${candidates.length} issue${candidates.length === 1 ? "" : "s"} need attention*`,
          },
        },
      ],
      "Open issues",
    );
    // Every open issue for this team gets its own card.
    for (const item of candidates) {
      await postBlocks(install.botToken, ch.channelId, briefItemBlocks(item), item.title);
      posted++;
    }
  }

  return { ok: true, channels: channels.length, posted };
}
