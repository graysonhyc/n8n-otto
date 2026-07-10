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
