import "server-only";
import { loadInstance } from "./source";
import { getAllOwners, getSop, listSops } from "@/lib/backoffice/store";
import {
  composeDeterministic,
  type WorkflowGraph,
  type WorkflowGraphNode,
} from "@/lib/derive/graph";
import { composeRegistryItem } from "@/lib/derive/registry";
import type { Sop } from "@/lib/backoffice/types";
import type { N8nWorkflow, N8nExecution } from "@/lib/n8n/types";
import type { Owner } from "@/lib/backoffice/types";

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

function toBoardWorkflow(
  wf: N8nWorkflow,
  executions: N8nExecution[],
  owner: Owner | null,
  now: number,
): BoardWorkflow {
  const item = composeRegistryItem(wf, executions, owner, now);
  return {
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

/** One row in the process table. */
export interface SopRow extends Sop {
  workflowCount: number;
}

export interface GroupsView {
  rows: SopRow[];
  totalWorkflows: number;
  unassignedCount: number;
  live: boolean;
}

/** The process table (list of SOPs) for `?view=groups`. */
export async function loadGroups(): Promise<GroupsView> {
  const [{ workflows, live }, sops] = await Promise.all([loadInstance(), listSops()]);
  const rows: SopRow[] = sops.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    updatedAt: s.updatedAt,
    workflowCount: s.members.length,
  }));
  const assignedCount = sops.reduce((n, s) => n + s.members.length, 0);
  return {
    rows,
    totalWorkflows: workflows.length,
    unassignedCount: workflows.length - assignedCount,
    live,
  };
}

/** A workflow candidate for adding to an SOP, annotated with its current SOP. */
export interface AddableWorkflow {
  wf: BoardWorkflow;
  currentSopId: string | null;
  currentSopName: string | null;
}

export interface SopDetailView {
  sop: Sop;
  members: BoardWorkflow[];
  /** Every workflow NOT already in this SOP, for the add-workflow picker. */
  addable: AddableWorkflow[];
  live: boolean;
}

/** The SOP detail page for `/map/sop/[id]`. Null if the SOP does not exist. */
export async function loadSopDetail(id: string): Promise<SopDetailView | null> {
  const [{ workflows, executions, live }, owners, sop, allSops] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    getSop(id),
    listSops(),
  ]);
  if (!sop) return null;

  const now = Date.now();
  const byId = new Map(workflows.map((w) => [w.id, w]));
  // workflowId -> the SOP it currently belongs to (for "moving from X" hints).
  const sopByWorkflow = new Map<string, { id: string; name: string }>();
  for (const s of allSops) {
    for (const m of s.members) sopByWorkflow.set(m.workflowId, { id: s.id, name: s.name });
  }
  const memberIds = new Set(sop.members.map((m) => m.workflowId));

  const members: BoardWorkflow[] = sop.members
    .map((m) => byId.get(m.workflowId))
    .filter((w): w is N8nWorkflow => !!w)
    .map((w) => toBoardWorkflow(w, executions, owners.get(w.id) ?? null, now));

  const addable: AddableWorkflow[] = workflows
    .filter((w) => !memberIds.has(w.id))
    .map((w) => {
      const cur = sopByWorkflow.get(w.id) ?? null;
      return {
        wf: toBoardWorkflow(w, executions, owners.get(w.id) ?? null, now),
        currentSopId: cur?.id ?? null,
        currentSopName: cur?.name ?? null,
      };
    });

  return { sop: { id: sop.id, name: sop.name, description: sop.description, updatedAt: sop.updatedAt }, members, addable, live };
}
