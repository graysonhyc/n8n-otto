import "server-only";
import { WebClient, type KnownBlock } from "@slack/web-api";

export function slackClient(botToken: string): WebClient {
  return new WebClient(botToken);
}

/**
 * The catch-all ops channel for anything with no owner channel. Wiring this makes
 * the daily brief, breakage alerts, and SOP suggestions always land somewhere
 * instead of silently no-op'ing when a workflow is unowned. Returns undefined
 * when `SLACK_MASTER_CHANNEL_ID` is unset (empty string also treated as unset).
 */
export function masterChannelId(): string | undefined {
  return process.env.SLACK_MASTER_CHANNEL_ID || undefined;
}

export async function postBlocks(
  botToken: string,
  channel: string,
  blocks: KnownBlock[],
  text: string,
): Promise<void> {
  await slackClient(botToken).chat.postMessage({ channel, blocks, text });
}
