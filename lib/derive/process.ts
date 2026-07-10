import type { ManualLink } from "@/lib/backoffice/types";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { workflowCallEdges } from "./edges";

/** An SOP process cluster: a connected component of process relationships. */
export interface ProcessGroup {
  key: string; // "pg:" + sorted member ids joined by "|" — stable, direction-independent
  name: string;
  workflowIds: string[]; // sorted
}

/** Cluster id-pairs into connected components (union-find). */
export function clusterByPairs(pairs: Array<[string, string]>, names: Map<string, string>): ProcessGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const [a, b] of pairs) union(a, b);

  const byRoot = new Map<string, Set<string>>();
  for (const node of parent.keys()) {
    const root = find(node);
    let set = byRoot.get(root);
    if (!set) {
      set = new Set<string>();
      byRoot.set(root, set);
    }
    set.add(node);
  }

  return [...byRoot.values()]
    .map((set) => {
      const workflowIds = [...set].sort();
      const key = "pg:" + workflowIds.join("|");
      return { key, workflowIds, name: names.get(key) ?? "Business process" };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Cluster workflows joined by `part-of-process` manual links into connected
 * components. `names` maps a group key → its human-given name.
 */
export function computeProcessGroups(links: ManualLink[], names: Map<string, string>): ProcessGroup[] {
  const pairs = links
    .filter((l) => l.relation === "part-of-process")
    .map((l) => [l.fromId, l.toId] as [string, string]);
  return clusterByPairs(pairs, names);
}

/** Ordered (caller → callee) pairs from tier-A Execute-Workflow call edges. */
export function callProcessPairs(workflows: N8nWorkflow[]): Array<[string, string]> {
  const ids = new Set(workflows.map((w) => w.id));
  const pairs: Array<[string, string]> = [];
  for (const wf of workflows) {
    for (const e of workflowCallEdges(wf)) {
      if (ids.has(e.to)) pairs.push([e.from, e.to]);
    }
  }
  return pairs;
}

/**
 * Auto + manual processes: a call chain (Execute Workflow) IS an ordered
 * process, so we seed clusters from both manual `part-of-process` links and
 * tier-A call edges. This makes the process view populate itself instead of
 * requiring every link to be drawn by hand.
 */
export function computeProcessGroupsMerged(
  workflows: N8nWorkflow[],
  links: ManualLink[],
  names: Map<string, string>,
): ProcessGroup[] {
  const manual = links
    .filter((l) => l.relation === "part-of-process")
    .map((l) => [l.fromId, l.toId] as [string, string]);
  return clusterByPairs([...manual, ...callProcessPairs(workflows)], names);
}
