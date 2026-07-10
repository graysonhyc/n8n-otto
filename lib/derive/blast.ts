import type { WorkflowGraph, WorkflowGraphNode } from "@/lib/derive/graph";

// Blast radius: everything impacted if a workflow breaks or changes.
//   - downstream workflows reachable via calls (tier A) or shared-credential (tier A),
//     in both directions (a break upstream OR downstream is a break for you);
//   - the systems it touches (uses-system, tier B);
//   - its business process (process group), if any;
//   - the distinct owner teams of all of the above — i.e. who else to page.
export interface BlastRadius {
  workflowId: string;
  downstreamWorkflowIds: string[];
  systems: string[];
  processGroup: { key: string; name: string; workflowIds: string[] } | null;
  affectedOwnerTeams: string[];
}

function isWorkflow(n: WorkflowGraph["nodes"][number]): n is WorkflowGraphNode {
  return n.kind === "workflow";
}

export function blastRadius(id: string, graph: WorkflowGraph): BlastRadius {
  const wfNodes = new Map(graph.nodes.filter(isWorkflow).map((n) => [n.id, n]));
  const nameById = new Map(graph.nodes.map((n) => [n.id, n.name]));

  const downstream = new Set<string>();
  const systems = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind === "calls" || e.kind === "shares-credential") {
      if (e.source === id && wfNodes.has(e.target)) downstream.add(e.target);
      if (e.target === id && wfNodes.has(e.source)) downstream.add(e.source);
    }
    if (e.kind === "uses-system" && e.source === id) {
      systems.add(nameById.get(e.target) ?? e.target);
    }
  }

  const group = graph.groups.find((g) => g.workflowIds.includes(id)) ?? null;
  const groupMembers = group ? group.workflowIds.filter((w) => w !== id) : [];

  const owners = new Set<string>();
  for (const wid of [...downstream, ...groupMembers]) {
    const team = wfNodes.get(wid)?.ownerTeam;
    if (team) owners.add(team);
  }
  const self = wfNodes.get(id)?.ownerTeam;
  if (self) owners.add(self);

  return {
    workflowId: id,
    downstreamWorkflowIds: [...downstream].sort(),
    systems: [...systems].sort(),
    processGroup: group
      ? { key: group.key, name: group.name, workflowIds: group.workflowIds }
      : null,
    affectedOwnerTeams: [...owners].sort(),
  };
}
