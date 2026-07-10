import type { BriefItem } from "@/lib/brief/build";
import type { BriefItemStatus, Owner } from "@/lib/backoffice/types";

export interface NotifyDeps {
  items: BriefItem[];
  owners: Map<string, Owner>;
  notified: Set<string>;
  states: Map<string, BriefItemStatus>;
  post: (channelId: string, item: BriefItem) => Promise<void>;
  markNotified: (key: string) => Promise<void>;
  clearNotified: (keys: string[]) => Promise<void>;
}

// Decide what to post and what to re-arm. Pure over its injected deps: posts any
// item that is new (not yet notified), not suppressed (dismissed/acknowledged),
// and has an owner channel; deletes notification rows for keys no longer produced
// by the brief so a recurrence re-alerts. Effects (post / mark / clear) are
// injected, which keeps this unit-testable and free of server-only imports.
export async function notifyNewItems(deps: NotifyDeps): Promise<{ posted: number; rearmed: number }> {
  const currentKeys = new Set(deps.items.map((i) => i.key));

  // Re-arm: keys we notified about that the brief no longer produces (resolved).
  const resolved = [...deps.notified].filter((k) => !currentKeys.has(k));
  if (resolved.length > 0) await deps.clearNotified(resolved);

  let posted = 0;
  for (const item of deps.items) {
    if (deps.notified.has(item.key)) continue;
    const status = deps.states.get(item.key);
    if (status === "dismissed" || status === "acknowledged") continue;
    const channelId = item.workflowId ? deps.owners.get(item.workflowId)?.slackChannelId : null;
    if (!channelId) continue; // unowned / no channel → skipped
    await deps.post(channelId, item);
    await deps.markNotified(item.key);
    posted++;
  }

  return { posted, rearmed: resolved.length };
}
