import type { RegistryItem } from "@/lib/derive/registry";
import type { N8nExecution } from "@/lib/n8n/types";
import { TYPE_DEFAULT_MINUTES } from "@/lib/brief/daily";

// The Value & Waste ledger: what the estate is worth (time saved) and what is
// dead weight (idle or failing). Pure — the CFO-grade view Otto reports.
export interface EstateLedger {
  windowDays: number;
  totals: { workflows: number; active: number; unowned: number; unownedCritical: number };
  roi: {
    minutesSaved: number;
    hoursSaved: number;
    estimated: boolean; // true when any contributor used a type default, not a set estimate
    top: Array<{ id: string; name: string; hours: number }>;
  };
  waste: {
    idle: Array<{ id: string; name: string }>;
    failing: Array<{ id: string; name: string; failures: number }>;
    unestimated: number; // active workflows with no time-saved estimate set
  };
}

const FAILING_THRESHOLD = 3;

export function estateLedger(
  items: RegistryItem[],
  executions: N8nExecution[],
  now: number,
  windowDays = 30,
): EstateLedger {
  const cutoff = now - windowDays * 86_400_000;

  const successesByWorkflow = new Map<string, number>();
  const runsByWorkflow = new Map<string, number>();
  for (const e of executions) {
    if (Date.parse(e.startedAt) < cutoff) continue;
    runsByWorkflow.set(e.workflowId, (runsByWorkflow.get(e.workflowId) ?? 0) + 1);
    if (e.status === "success") {
      successesByWorkflow.set(e.workflowId, (successesByWorkflow.get(e.workflowId) ?? 0) + 1);
    }
  }

  let minutesSaved = 0;
  let estimated = false;
  const contributors: Array<{ id: string; name: string; hours: number }> = [];
  const idle: EstateLedger["waste"]["idle"] = [];
  const failing: EstateLedger["waste"]["failing"] = [];
  let unowned = 0;
  let unownedCritical = 0;
  let unestimated = 0;

  for (const item of items) {
    const successes = successesByWorkflow.get(item.id) ?? 0;
    const perRun = item.timeSavedPerExecution ?? TYPE_DEFAULT_MINUTES[item.type];
    const mins = successes * perRun;
    if (successes > 0 && item.timeSavedPerExecution == null) estimated = true;
    if (mins > 0) contributors.push({ id: item.id, name: item.name, hours: mins / 60 });
    minutesSaved += mins;

    if (item.active) {
      if (item.timeSavedPerExecution == null) unestimated++;
      if (!item.owner) unowned++;
      if (!item.owner && item.criticality === "High") unownedCritical++;
      if ((runsByWorkflow.get(item.id) ?? 0) === 0) idle.push({ id: item.id, name: item.name });
      if (item.health.recentFailures >= FAILING_THRESHOLD) {
        failing.push({ id: item.id, name: item.name, failures: item.health.recentFailures });
      }
    }
  }

  contributors.sort((a, b) => b.hours - a.hours);

  return {
    windowDays,
    totals: {
      workflows: items.length,
      active: items.filter((i) => i.active).length,
      unowned,
      unownedCritical,
    },
    roi: {
      minutesSaved,
      hoursSaved: Math.round((minutesSaved / 60) * 10) / 10,
      estimated,
      top: contributors.slice(0, 5).map((c) => ({ ...c, hours: Math.round(c.hours * 10) / 10 })),
    },
    waste: { idle, failing, unestimated },
  };
}
