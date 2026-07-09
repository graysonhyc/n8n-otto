import type { Owner } from "@/lib/backoffice/types";

export interface Routing {
  channelId: string;
  routedByOwner: boolean;
  channelName: string | null;
}

// Resolves where a workflow's alert should go: the owner's channel if assigned,
// otherwise the master #n8n-backoffice channel.
export function resolveRouting(owner: Owner | null, masterChannelId: string): Routing {
  if (owner?.slackChannelId) {
    return {
      channelId: owner.slackChannelId,
      routedByOwner: true,
      channelName: owner.slackChannelName,
    };
  }
  return { channelId: masterChannelId, routedByOwner: false, channelName: null };
}
