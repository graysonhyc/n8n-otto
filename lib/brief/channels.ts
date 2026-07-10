import type { N8nExecution } from "@/lib/n8n/types";
import type { RegistryItem } from "@/lib/derive/registry";
import type { ChangeEvent } from "@/lib/diff/snapshot";
import type { BriefItem, SharedCredentialInfo } from "./build";
import { computeDailyBrief, type DailyBrief } from "./daily";

export interface ChannelBrief {
  channelId: string;
  channelName: string | null;
  daily: DailyBrief;
  attention: BriefItem[];
}

// Split the estate into one brief per Slack channel. The channel comes from each
// workflow's owner assignment (owner.slackChannelId); workflows with no channel
// are skipped entirely. computeDailyBrief self-scopes on the items passed (it
// builds its own id index and ignores executions/changes for unknown ids), so we
// only need to filter items, shared credentials, and attention per channel.
export function groupBriefsByChannel(input: {
  items: RegistryItem[];
  executions: N8nExecution[];
  changes: Map<string, ChangeEvent[]>;
  attention: BriefItem[];
  sharedCredentials: SharedCredentialInfo[];
  now: number;
  offsetMin?: number;
}): ChannelBrief[] {
  const buckets = new Map<string, { channelName: string | null; ids: Set<string> }>();
  for (const item of input.items) {
    const channelId = item.owner?.slackChannelId;
    if (!channelId) continue;
    let bucket = buckets.get(channelId);
    if (!bucket) {
      bucket = { channelName: item.owner?.slackChannelName ?? null, ids: new Set() };
      buckets.set(channelId, bucket);
    }
    bucket.ids.add(item.id);
  }

  const out: ChannelBrief[] = [];
  for (const [channelId, { channelName, ids }] of buckets) {
    const items = input.items.filter((i) => ids.has(i.id));
    const sharedCredentials = input.sharedCredentials.filter((c) =>
      c.workflowIds.some((id) => ids.has(id)),
    );
    const attention = input.attention.filter((a) => a.workflowId != null && ids.has(a.workflowId));
    const daily = computeDailyBrief({
      items,
      executions: input.executions,
      changes: input.changes,
      attention,
      sharedCredentials,
      now: input.now,
      offsetMin: input.offsetMin,
    });
    out.push({ channelId, channelName, daily, attention });
  }
  return out;
}
