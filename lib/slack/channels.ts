import "server-only";
import { WebClient } from "@slack/web-api";
import type { SlackChannel } from "@/components/ui/SlackChannelPicker";

// Lists public + private channels the bot can see. The bot must be a member to
// post, so `isMember` drives the "invite bot" hint in the picker.
export async function listSlackChannels(botToken: string): Promise<SlackChannel[]> {
  const client = new WebClient(botToken);
  const out: SlackChannel[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of res.channels ?? []) {
      if (c.id && c.name) {
        out.push({ id: c.id, name: c.name, isMember: Boolean(c.is_member) });
      }
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
