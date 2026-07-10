import "server-only";
import { loadInstance } from "./source";
import { getAllOwners, listSops } from "@/lib/backoffice/store";
import {
  composeDeterministic,
  type WorkflowGraph,
  type WorkflowGraphNode,
} from "@/lib/derive/graph";
import { composeRegistryItem } from "@/lib/derive/registry";
import type { SopWithMembers } from "@/lib/backoffice/types";

export interface DeterministicLayers {
  dataSources: boolean;
  credentials: boolean;
}

export interface DeterministicView {
  graph: WorkflowGraph;
  live: boolean;
}

/** The auto-parsed relationship graph for `?view=auto`. */
export async function loadDeterministic(layers: DeterministicLayers): Promise<DeterministicView> {
  const [{ workflows, executions, live }, owners] = await Promise.all([
    loadInstance(),
    getAllOwners(),
  ]);
  const graph = composeDeterministic({ workflows, executions, owners, now: Date.now(), layers });
  return { graph, live };
}

export type BoardWorkflow = WorkflowGraphNode;

export interface GroupsView {
  sops: SopWithMembers[];
  /** Every workflow node keyed by id, for rendering assigned + unassigned cards. */
  workflowsById: Record<string, BoardWorkflow>;
  /** Ids not assigned to any SOP. */
  unassignedIds: string[];
  live: boolean;
}

/** The hand-authored SOP board for `?view=groups`. */
export async function loadGroups(): Promise<GroupsView> {
  const [{ workflows, executions, live }, owners, sops] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    listSops(),
  ]);
  const now = Date.now();
  const workflowsById: Record<string, BoardWorkflow> = {};
  for (const wf of workflows) {
    const item = composeRegistryItem(wf, executions, owners.get(wf.id) ?? null, now);
    workflowsById[wf.id] = {
      id: wf.id,
      kind: "workflow",
      name: item.name,
      type: item.type,
      risk: item.risk.level,
      ownerTeam: item.owner?.team ?? null,
      recentFailures: item.health.recentFailures,
      groupKey: null,
    };
  }
  const assigned = new Set(sops.flatMap((s) => s.members.map((m) => m.workflowId)));
  const unassignedIds = workflows.map((w) => w.id).filter((id) => !assigned.has(id));
  return { sops, workflowsById, unassignedIds, live };
}
