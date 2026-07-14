import type { N8nExecution } from "@/lib/n8n/types";
import type { RegistryItem } from "@/lib/derive/registry";
import type { BriefItem } from "./build";
import { computeTeamStats, type TeamStats } from "./teamStats";

// An archived workflow's channel routing (resolved in the data layer against its
// owner assignment), so a team's archived count lands in the right bucket even
// when the workflow itself is filtered out of the registry.
export interface ArchivedRef {
  channelId: string;
  channelName: string | null;
}

export interface ChannelBrief {
  channelId: string;
  channelName: string | null;
  stats: TeamStats;
  attention: BriefItem[];
}

// Split the estate into one brief per Slack channel (≈ per team). The channel
// comes from each workflow's owner assignment (owner.slackChannelId); workflows
// with no channel fall back to `masterChannelId` (the catch-all ops channel) when
// one is given, and are skipped only when there is no fallback either. Each
// bucket gets a deterministic TeamStats snapshot (scoped active items + archived
// count) plus its own attention items for the ticket-candidate highlight.
export function groupBriefsByChannel(input: {
  items: RegistryItem[];
  executions: N8nExecution[];
  attention: BriefItem[];
  archived?: ArchivedRef[];
  now: number;
  offsetMin?: number;
  masterChannelId?: string;
}): ChannelBrief[] {
  const buckets = new Map<string, { channelName: string | null; ids: Set<string> }>();
  for (const item of input.items) {
    const channelId = item.owner?.slackChannelId ?? input.masterChannelId;
    if (!channelId) continue;
    let bucket = buckets.get(channelId);
    if (!bucket) {
      bucket = { channelName: item.owner?.slackChannelName ?? null, ids: new Set() };
      buckets.set(channelId, bucket);
    }
    bucket.ids.add(item.id);
  }

  // Fold in archived counts per channel; seed a bucket for any team that owns
  // only archived workflows so it still gets a (mostly-zero) brief.
  const archivedCounts = new Map<string, number>();
  for (const a of input.archived ?? []) {
    archivedCounts.set(a.channelId, (archivedCounts.get(a.channelId) ?? 0) + 1);
    if (!buckets.has(a.channelId)) {
      buckets.set(a.channelId, { channelName: a.channelName, ids: new Set() });
    }
  }

  const out: ChannelBrief[] = [];
  for (const [channelId, { channelName, ids }] of buckets) {
    const items = input.items.filter((i) => ids.has(i.id));
    // Attach an item to this team when it targets one of the team's workflows —
    // either directly (workflowId) or as one of several affected workflows
    // (workflowIds, e.g. a shared-credential brief spanning multiple teams).
    const attention = input.attention.filter(
      (a) =>
        (a.workflowId != null && ids.has(a.workflowId)) ||
        (a.workflowIds?.some((id) => ids.has(id)) ?? false),
    );
    const stats = computeTeamStats({
      items,
      executions: input.executions,
      archived: archivedCounts.get(channelId) ?? 0,
      now: input.now,
      offsetMin: input.offsetMin,
    });
    out.push({ channelId, channelName, stats, attention });
  }
  return out;
}
