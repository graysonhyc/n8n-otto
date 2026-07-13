import type { WorkflowGraph, WorkflowGraphNode, GraphEdge } from "@/lib/derive/graph";

// Blast radius: everything impacted if a workflow breaks or changes.
//   - IMPACT (confident): downstream workflows reachable via an exact dependency
//     edge — calls / subworkflow-tool / webhook hand-off / shared credential /
//     shared data source — in both directions (a break upstream OR downstream is
//     a break for you);
//   - ADVISORY (lower confidence): workflows that merely share an external system
//     (tier B) or are semantically similar (a near-duplicate you may need to keep
//     in sync). Surfaced separately so a confident answer isn't diluted;
//   - the systems it touches (uses-system, tier B);
//   - its linked-workflow group, if any;
//   - the distinct owner teams of the impact set — i.e. who else to page.
export interface BlastRadius {
  workflowId: string;
  downstreamWorkflowIds: string[]; // impact set (confident)
  advisoryWorkflowIds: string[]; // same-system / semantic-similar (lower confidence)
  systems: string[];
  processGroup: { key: string; name: string; workflowIds: string[] } | null;
  affectedOwnerTeams: string[];
}

// Exact dependency edges — a break on either end propagates.
const IMPACT_KINDS: ReadonlySet<GraphEdge["kind"]> = new Set([
  "calls",
  "subworkflow-tool",
  "webhook-handoff",
  "shares-credential",
  "shares-datasource",
]);

function isWorkflow(n: WorkflowGraph["nodes"][number]): n is WorkflowGraphNode {
  return n.kind === "workflow";
}

export function blastRadius(id: string, graph: WorkflowGraph): BlastRadius {
  const wfNodes = new Map(graph.nodes.filter(isWorkflow).map((n) => [n.id, n]));
  const nameById = new Map(graph.nodes.map((n) => [n.id, n.name]));

  const impact = new Set<string>();
  const advisory = new Set<string>();
  const systems = new Set<string>();
  const systemsUsed = new Set<string>(); // system node ids this workflow touches

  for (const e of graph.edges) {
    if (IMPACT_KINDS.has(e.kind)) {
      if (e.source === id && wfNodes.has(e.target)) impact.add(e.target);
      if (e.target === id && wfNodes.has(e.source)) impact.add(e.source);
    }
    if (e.kind === "similar") {
      if (e.source === id && wfNodes.has(e.target)) advisory.add(e.target);
      if (e.target === id && wfNodes.has(e.source)) advisory.add(e.source);
    }
    if (e.kind === "uses-system" && e.source === id) {
      systems.add(nameById.get(e.target) ?? e.target);
      systemsUsed.add(e.target);
    }
  }

  // Same-system peers → advisory (they share an integration, not a direct dep).
  if (systemsUsed.size) {
    for (const e of graph.edges) {
      if (e.kind !== "uses-system") continue;
      if (e.source !== id && systemsUsed.has(e.target) && wfNodes.has(e.source)) {
        advisory.add(e.source);
      }
    }
  }

  // Advisory never double-counts the impact set or self.
  for (const wid of impact) advisory.delete(wid);
  advisory.delete(id);

  const group = graph.groups.find((g) => g.workflowIds.includes(id)) ?? null;
  const groupMembers = group ? group.workflowIds.filter((w) => w !== id) : [];

  const owners = new Set<string>();
  for (const wid of [...impact, ...groupMembers]) {
    const team = wfNodes.get(wid)?.ownerTeam;
    if (team) owners.add(team);
  }
  const self = wfNodes.get(id)?.ownerTeam;
  if (self) owners.add(self);

  return {
    workflowId: id,
    downstreamWorkflowIds: [...impact].sort(),
    advisoryWorkflowIds: [...advisory].sort(),
    systems: [...systems].sort(),
    processGroup: group
      ? { key: group.key, name: group.name, workflowIds: group.workflowIds }
      : null,
    affectedOwnerTeams: [...owners].sort(),
  };
}
