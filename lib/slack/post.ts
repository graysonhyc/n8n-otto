import "server-only";
import { WebClient, type KnownBlock } from "@slack/web-api";

export function slackClient(botToken: string): WebClient {
  return new WebClient(botToken);
}

export async function postBlocks(
  botToken: string,
  channel: string,
  blocks: KnownBlock[],
  text: string,
): Promise<void> {
  await slackClient(botToken).chat.postMessage({ channel, blocks, text });
}

// Resolve the master #n8n-backoffice channel: env override, else lookup by name.
export async function getMasterChannelId(botToken: string): Promise<string | null> {
  if (process.env.SLACK_MASTER_CHANNEL_ID) return process.env.SLACK_MASTER_CHANNEL_ID;
  const client = slackClient(botToken);
  let cursor: string | undefined;
  do {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    const match = (res.channels ?? []).find((c) => c.name === "n8n-backoffice");
    if (match?.id) return match.id;
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return null;
}
