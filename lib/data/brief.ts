import "server-only";
import { loadInstance } from "./source";
import { runSync } from "./sync";
import { getAllOwners, getBriefStates, getAllLinks } from "@/lib/backoffice/store";
import { composeRegistry } from "@/lib/derive/registry";
import { credentialGroups } from "@/lib/derive/edges";
import { composeGraph } from "@/lib/derive/graph";
import { blastRadius, type BlastRadius } from "@/lib/derive/blast";
import { buildBrief, type BriefItem } from "@/lib/brief/build";
import { computeDailyBrief, type DailyBrief } from "@/lib/brief/daily";
import { groupBriefsByChannel, type ChannelBrief, type ArchivedRef } from "@/lib/brief/channels";
import { masterChannelId } from "@/lib/slack/post";
import type { N8nWorkflow, N8nExecution } from "@/lib/n8n/types";
import type { Owner, ManualLink } from "@/lib/backoffice/types";

// Blast-radius map for every workflow, so the brief can name who else is
// affected by an incident or behaviour change.
function blastMap(
  workflows: N8nWorkflow[],
  executions: N8nExecution[],
  owners: Map<string, Owner>,
  links: ManualLink[],
  groupNames: Map<string, string>,
  now: number,
): Map<string, BlastRadius> {
  const graph = composeGraph({ workflows, executions, owners, links, groupNames, now });
  const map = new Map<string, BlastRadius>();
  for (const n of graph.nodes) {
    if (n.kind === "workflow") map.set(n.id, blastRadius(n.id, graph));
  }
  return map;
}

// Fixed clock for the demo fixtures (all dated 2026-07-09) so the daily brief's
// "yesterday" window always lands on them. Live instances use the real clock.
const DEMO_NOW = Date.parse("2026-07-10T09:00:00+02:00");

export interface BriefView {
  items: BriefItem[];
  live: boolean;
  scanned: number;
}

export async function loadBrief(): Promise<BriefView> {
  const [{ workflows, executions, live }, owners, states, links, groupNames, { changes, scanned }] =
    await Promise.all([
      loadInstance(),
      getAllOwners(),
      getBriefStates(),
      getAllLinks(),
      Promise.resolve(new Map<string, string>()),
      runSync(),
    ]);

  const now = Date.now();
  const items = composeRegistry({ workflows, executions, owners, now });
  const sharedCredentials = credentialGroups(workflows);
  const blastById = blastMap(workflows, executions, owners, links, groupNames, now);

  const brief = buildBrief({ items, changes, sharedCredentials, blastById }).filter(
    (b) => states.get(b.key) !== "dismissed",
  );

  return { items: brief, live, scanned };
}

export interface DailyBriefView {
  daily: DailyBrief;
  attention: BriefItem[];
  live: boolean;
  scanned: number;
}

// Everything the Slack daily brief needs: the three computed sections plus the
// (non-dismissed) attention items, which are still routed to owner channels.
export async function loadDailyBrief(): Promise<DailyBriefView> {
  const [{ workflows, executions, live }, owners, states, links, groupNames, { changes, scanned }] =
    await Promise.all([
      loadInstance(),
      getAllOwners(),
      getBriefStates(),
      getAllLinks(),
      Promise.resolve(new Map<string, string>()),
      runSync(),
    ]);

  const now = live ? Date.now() : DEMO_NOW;
  const items = composeRegistry({ workflows, executions, owners, now });
  const sharedCredentials = credentialGroups(workflows);
  const blastById = blastMap(workflows, executions, owners, links, groupNames, now);

  const attention = buildBrief({ items, changes, sharedCredentials, blastById }).filter(
    (b) => states.get(b.key) !== "dismissed",
  );

  const daily = computeDailyBrief({ items, executions, changes, attention, sharedCredentials, now });

  return { daily, attention, live, scanned };
}

export interface ChannelBriefsView {
  channels: ChannelBrief[];
  live: boolean;
  scanned: number;
}

// One Otto-narrated brief per Slack channel: the estate is grouped by each
// workflow's owner channel (workflows with no channel are skipped), and every
// bucket gets its own scoped Yesterday/Today/Explore brief plus its attention
// items. Shared by the manual "Send to Slack" action and the morning cron.
export async function loadChannelBriefs(): Promise<ChannelBriefsView> {
  const [{ workflows, archived, executions, live }, owners, states, links, groupNames, { changes, scanned }] =
    await Promise.all([
      loadInstance(),
      getAllOwners(),
      getBriefStates(),
      getAllLinks(),
      Promise.resolve(new Map<string, string>()),
      runSync(),
    ]);

  const now = live ? Date.now() : DEMO_NOW;
  const items = composeRegistry({ workflows, executions, owners, now });
  const sharedCredentials = credentialGroups(workflows);
  const blastById = blastMap(workflows, executions, owners, links, groupNames, now);

  const attention = buildBrief({ items, changes, sharedCredentials, blastById }).filter(
    (b) => states.get(b.key) !== "dismissed",
  );

  // Route each archived workflow to its team's channel so the per-team archived
  // count lands in the right bucket, even though archived workflows never reach
  // the registry (excluded at the n8n client).
  const master = masterChannelId();
  const archivedRefs: ArchivedRef[] = archived.flatMap((w) => {
    const owner = owners.get(w.id);
    const channelId = owner?.slackChannelId ?? master;
    return channelId ? [{ channelId, channelName: owner?.slackChannelName ?? null }] : [];
  });

  const channels = groupBriefsByChannel({
    items,
    executions,
    attention,
    archived: archivedRefs,
    now,
    masterChannelId: master,
  });
  return { channels, live, scanned };
}
