import "server-only";
import { getSlackInstall } from "@/lib/backoffice/store";
import { loadChannelBriefs } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks, briefFooterBlock } from "@/lib/slack/blocks";
import { narrateBrief } from "@/lib/brief/narrate";
import { openaiFromEnv } from "@/lib/agent/openai";

export type SendBriefResult =
  | { ok: false; status: number; error: string }
  | { ok: true; channels: number; posted: number };

// Posts one Otto-narrated daily brief per Slack channel, scoped to the workflows
// owned in that channel, then the channel's attention items as interactive cards.
// Workflows with no channel are skipped; there is no master channel. Shared by the
// manual "Send to Slack" action and the 09:00 CEST cron.
export async function sendDailyBrief(): Promise<SendBriefResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const openai = openaiFromEnv();
  if (!openai) return { ok: false, status: 400, error: "OPENAI_API_KEY not set — Otto can't write the brief" };

  const { channels } = await loadChannelBriefs();

  let posted = 0;
  for (const ch of channels) {
    const prose = await narrateBrief({ daily: ch.daily, channelName: ch.channelName, client: openai });
    await postBlocks(
      install.botToken,
      ch.channelId,
      [
        { type: "section", text: { type: "mrkdwn", text: prose } },
        briefFooterBlock(ch.daily),
      ],
      "n8n Otto — Daily Brief",
    );
    for (const item of ch.attention) {
      await postBlocks(install.botToken, ch.channelId, briefItemBlocks(item), item.title);
      posted++;
    }
  }

  return { ok: true, channels: channels.length, posted };
}
