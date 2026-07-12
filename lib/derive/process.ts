import type { ManualLink } from "@/lib/backoffice/types";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { workflowCallEdges } from "./edges";

/** An SOP process cluster: a connected component of process relationships. */
export interface ProcessGroup {
  key: string; // "pg:" + sorted member ids joined by "|" — stable, direction-independent
  name: string;
  workflowIds: string[]; // sorted
}

/** A hand-authored SOP (ProcessGroup table) projected for graph merging. */
export interface AuthoredSop {
  id: string;
  name: string;
  workflowIds: string[];
}

/**
 * Merge hand-authored SOPs (the human source of truth) with auto-detected
 * clusters. Authored SOPs win: any workflow assigned to one is removed from the
 * derived clusters so a workflow never appears in two "processes". Derived
 * clusters that fall below two members after trimming are dropped (a process
 * needs at least two steps); authored SOPs are kept even at one member because a
 * human explicitly declared them.
 */
export function mergeAuthoredGroups(
  authored: AuthoredSop[],
  derived: ProcessGroup[],
): ProcessGroup[] {
  const authoredGroups: ProcessGroup[] = authored
    .map((s) => ({
      key: "sop:" + s.id, // distinct from derived "pg:" keys
      name: s.name,
      workflowIds: [...s.workflowIds].sort(),
    }))
    .filter((g) => g.workflowIds.length > 0);

  const claimed = new Set(authoredGroups.flatMap((g) => g.workflowIds));
  const trimmed = derived
    .map((g) => ({ ...g, workflowIds: g.workflowIds.filter((id) => !claimed.has(id)) }))
    .filter((g) => g.workflowIds.length >= 2);

  return [...authoredGroups, ...trimmed];
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
