import type { ManualLink } from "@/lib/backoffice/types";

/** An SOP process cluster: a connected component of `part-of-process` links. */
export interface ProcessGroup {
  key: string; // "pg:" + sorted member ids joined by "|" — stable, direction-independent
  name: string;
  workflowIds: string[]; // sorted
}

/**
 * Cluster workflows joined by `part-of-process` manual links into connected
 * components (union-find). `names` maps a group key → its human-given name.
 */
export function computeProcessGroups(
  links: ManualLink[],
  names: Map<string, string>,
): ProcessGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
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

  for (const l of links) {
    if (l.relation !== "part-of-process") continue;
    union(l.fromId, l.toId);
  }

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
