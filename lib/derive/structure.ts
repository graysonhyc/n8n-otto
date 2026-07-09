import type { N8nWorkflow } from "@/lib/n8n/types";

const STICKY_NOTE = "n8n-nodes-base.stickyNote";

function baseName(type: string): string {
  return type.split(".").pop() ?? type;
}

function isTrigger(type: string): boolean {
  return baseName(type).toLowerCase().endsWith("trigger");
}

// Build source → [target node names] over every connection type (main + ai_*).
function adjacency(workflow: N8nWorkflow): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const [source, byType] of Object.entries(workflow.connections)) {
    const targets: string[] = [];
    for (const groups of Object.values(byType)) {
      for (const group of groups) {
        for (const t of group) targets.push(t.node);
      }
    }
    adj.set(source, targets);
  }
  return adj;
}

/**
 * Nodes not reachable from any trigger — i.e. dangling chains that will silently
 * never run. Excludes sticky notes and disabled nodes.
 *
 * Note: ai_* tool/model nodes connect INTO an agent (tool → agent), so the agent
 * reaches them via reverse edges too; we treat connections as undirected for
 * reachability so a wired agent's tools aren't falsely flagged.
 */
export function unreachableNodes(workflow: N8nWorkflow): string[] {
  const real = workflow.nodes.filter(
    (n) => n.type !== STICKY_NOTE && !n.disabled,
  );
  const realNames = new Set(real.map((n) => n.name));

  const roots = real.filter((n) => isTrigger(n.type)).map((n) => n.name);
  // If a workflow has no trigger (e.g. only a sub-workflow entry), treat nodes
  // with no inbound edges as roots so we don't over-flag.
  const forward = adjacency(workflow);
  if (roots.length === 0) {
    const hasInbound = new Set<string>();
    for (const targets of forward.values()) for (const t of targets) hasInbound.add(t);
    for (const n of real) if (!hasInbound.has(n.name)) roots.push(n.name);
  }

  // Undirected adjacency so tools/models linked into a reachable agent count.
  const undirected = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!undirected.has(a)) undirected.set(a, new Set());
    undirected.get(a)!.add(b);
  };
  for (const [source, targets] of forward) {
    for (const t of targets) {
      link(source, t);
      link(t, source);
    }
  }

  const reachable = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const node = queue.shift()!;
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (const next of undirected.get(node) ?? []) {
      if (!reachable.has(next)) queue.push(next);
    }
  }

  return real
    .filter((n) => realNames.has(n.name) && !reachable.has(n.name))
    .map((n) => n.name);
}
