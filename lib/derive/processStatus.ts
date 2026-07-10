import type { ProcessGroup } from "./process";
import type { RegistryItem } from "@/lib/derive/registry";

// Process-level rollup: order the member workflows into their execution
// sequence and roll their health up into one status. This is what turns a
// cluster of workflows into a business process you can reason about end to end.
export interface ProcessStep {
  id: string;
  name: string;
  owner: string | null;
  risk: "high" | "medium" | "low";
  recentFailures: number;
}

export interface ProcessStatus {
  key: string;
  name: string;
  health: "healthy" | "degraded" | "stalled";
  stalledAt: { id: string; name: string } | null;
  steps: ProcessStep[];
  owners: string[];
}

const FAILING_THRESHOLD = 3;

/** Topological order of `members` using caller→callee pairs; stable fallback. */
function order(members: string[], pairs: Array<[string, string]>): string[] {
  const inSet = new Set(members);
  const indegree = new Map(members.map((m) => [m, 0]));
  const next = new Map<string, string[]>(members.map((m) => [m, []]));
  for (const [from, to] of pairs) {
    if (!inSet.has(from) || !inSet.has(to)) continue;
    next.get(from)!.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  // Kahn's algorithm; process ready nodes in stable sorted order for determinism.
  const ready = members.filter((m) => (indegree.get(m) ?? 0) === 0).sort();
  const out: string[] = [];
  const seen = new Set<string>();
  while (ready.length) {
    const n = ready.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    for (const m of next.get(n)!.sort()) {
      indegree.set(m, (indegree.get(m) ?? 0) - 1);
      if ((indegree.get(m) ?? 0) === 0 && !seen.has(m)) ready.push(m);
    }
    ready.sort();
  }
  // Any leftover (cycle) appended in member order so nothing is dropped.
  for (const m of members) if (!seen.has(m)) out.push(m);
  return out;
}

export function processStatus(
  group: ProcessGroup,
  items: RegistryItem[],
  callPairs: Array<[string, string]>,
): ProcessStatus {
  const byId = new Map(items.map((i) => [i.id, i]));
  const orderedIds = order(group.workflowIds, callPairs);

  const steps: ProcessStep[] = orderedIds
    .map((id) => byId.get(id))
    .filter((i): i is RegistryItem => Boolean(i))
    .map((i) => ({
      id: i.id,
      name: i.name,
      owner: i.owner?.team ?? null,
      risk: i.risk.level,
      recentFailures: i.health.recentFailures,
    }));

  const firstFailing = steps.find((s) => s.recentFailures >= FAILING_THRESHOLD) ?? null;
  const anyDegraded = steps.some((s) => s.risk === "high" || s.recentFailures > 0);
  const health: ProcessStatus["health"] = firstFailing ? "stalled" : anyDegraded ? "degraded" : "healthy";

  const owners = [...new Set(steps.map((s) => s.owner).filter((o): o is string => Boolean(o)))].sort();

  return {
    key: group.key,
    name: group.name,
    health,
    stalledAt: firstFailing ? { id: firstFailing.id, name: firstFailing.name } : null,
    steps,
    owners,
  };
}
