import "server-only";
import { loadInstance } from "./source";
import { getAllLinks, getAllOwners, getSop, getSuggestionStates, listSops } from "@/lib/backoffice/store";
import { buildClusters, classifySuggestions, type SopSuggestion } from "@/lib/derive/suggestions";
import { enrichSuggestions } from "./suggestions";
import type { WorkflowGraphNode } from "@/lib/derive/graph";
import { composeRegistry, composeRegistryItem } from "@/lib/derive/registry";
import { computeBySystem } from "@/lib/derive/overview";
import { deriveRelationships, type RelationshipSummary } from "@/lib/derive/relationships";
import { workflowIntegrations } from "@/lib/derive/integrations";
import { computeSimilarPairs } from "./duplicates";
import type { LinkRelation, Sop } from "@/lib/backoffice/types";
import type { N8nWorkflow, N8nExecution } from "@/lib/n8n/types";
import type { Owner } from "@/lib/backoffice/types";

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
  /** Top integrations across all workflows — the breakdown moved off Overview. */
  bySystem: { label: string; value: number }[];
  live: boolean;
}

/** The process table (list of SOPs) for `?view=groups`. */
export async function loadGroups(): Promise<GroupsView> {
  const now = Date.now();
  const [{ workflows, executions, live }, owners, sops] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    listSops(),
  ]);
  const rows: SopRow[] = sops.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    updatedAt: s.updatedAt,
    workflowCount: s.members.length,
  }));
  const assignedCount = sops.reduce((n, s) => n + s.members.length, 0);
  const bySystem = computeBySystem(composeRegistry({ workflows, executions, owners, now }));
  return {
    rows,
    totalWorkflows: workflows.length,
    unassignedCount: workflows.length - assignedCount,
    bySystem,
    live,
  };
}

/** An integration shared across ≥2 workflows — the coupling/blast surface. */
export interface SharedIntegrationRow {
  integration: string;
  workflowCount: number;
  workflowNames: string[];
}

/** One manually-linked pair for the relationships table. */
export interface ManualLinkRow {
  id: string;
  fromName: string;
  toName: string;
  relation: LinkRelation;
  source: string;
}

/** A possible-duplicate pair for the relationships table. */
export interface DuplicateRow {
  aName: string;
  bName: string;
  score: number;
}

export interface RelationshipsView {
  summary: RelationshipSummary;
  sharedIntegrations: SharedIntegrationRow[];
  manualLinks: ManualLinkRow[];
  duplicates: DuplicateRow[];
  live: boolean;
}

/**
 * Estate-wide relationship dashboard data: the four-signal summary, the
 * integrations shared by ≥2 workflows (blast surface), and the human-authored
 * links. Rendered as summary + tables (an estate graph does not scale).
 */
export async function loadRelationshipsView(): Promise<RelationshipsView> {
  const [{ workflows, live }, links] = await Promise.all([loadInstance(), getAllLinks()]);
  const similar = await computeSimilarPairs(workflows);
  const nameById = new Map(workflows.map((w) => [w.id, w.name]));

  const { summary } = deriveRelationships(workflows);
  summary.duplicateCount = similar.length;

  const duplicates: DuplicateRow[] = similar.map((p) => ({
    aName: nameById.get(p.a) ?? p.a,
    bName: nameById.get(p.b) ?? p.b,
    score: p.score,
  }));

  // integration → workflows that use it (incl. sub-nodes), ≥2 = shared.
  const users = new Map<string, string[]>();
  for (const wf of workflows) {
    for (const integ of workflowIntegrations(wf)) {
      (users.get(integ) ?? users.set(integ, []).get(integ)!).push(wf.name);
    }
  }
  const sharedIntegrations: SharedIntegrationRow[] = [...users.entries()]
    .filter(([, names]) => names.length >= 2)
    .map(([integration, workflowNames]) => ({
      integration,
      workflowCount: workflowNames.length,
      workflowNames: workflowNames.sort(),
    }))
    .sort((a, b) => b.workflowCount - a.workflowCount || a.integration.localeCompare(b.integration));

  const manualLinks: ManualLinkRow[] = links.map((l) => ({
    id: l.id,
    fromName: nameById.get(l.fromId) ?? l.fromId,
    toName: nameById.get(l.toId) ?? l.toId,
    relation: l.relation,
    source: l.source,
  }));

  return { summary, sharedIntegrations, manualLinks, duplicates, live };
}

export interface SuggestionsView {
  suggestions: SopSuggestion[];
}

/**
 * Live SOP suggestions: deterministic clusters (call edges + shared data
 * sources) that aren't yet an SOP, minus any the team has dismissed.
 */
export async function loadSuggestions(): Promise<SuggestionsView> {
  const [{ workflows, executions }, owners, sops, states] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    listSops(),
    getSuggestionStates(),
  ]);
  const sopByWorkflow = new Map<string, { id: string; name: string }>();
  for (const s of sops) for (const m of s.members) sopByWorkflow.set(m.workflowId, { id: s.id, name: s.name });
  const dismissed = new Set([...states].filter(([, v]) => v === "dismissed").map(([k]) => k));
  const raw = classifySuggestions({ clusters: buildClusters(workflows), sopByWorkflow, dismissed });
  const suggestions = await enrichSuggestions(raw, { workflows, executions, owners });
  return { suggestions };
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
