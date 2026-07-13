import type { N8nWorkflow, N8nExecution, WorkflowType } from "@/lib/n8n/types";
import type { Owner, ManualLink } from "@/lib/backoffice/types";
import { composeRegistryItem } from "./registry";
import { systemEdges } from "./edges";
import { deriveRelationships, type RelationshipKind } from "./relationships";
import {
  computeProcessGroupsMerged,
  mergeAuthoredGroups,
  type AuthoredSop,
  type ProcessGroup,
} from "./process";

export type ColorBy = "risk" | "type" | "owner";

export interface WorkflowGraphNode {
  id: string;
  kind: "workflow";
  name: string;
  type: WorkflowType;
  risk: "high" | "medium" | "low";
  ownerTeam: string | null;
  recentFailures: number;
  groupKey: string | null;
}

export interface SystemGraphNode {
  id: string; // "system:<Name>"
  kind: "system";
  name: string;
}

export interface ResourceGraphNode {
  id: string; // "res:<system>:<resource>"
  kind: "resource";
  name: string; // the resource id (sheet/channel/table/doc)
  system: string;
}

export interface CredentialGraphNode {
  id: string; // "cred:<credentialId>"
  kind: "credential";
  name: string;
}

export type GraphNode =
  | WorkflowGraphNode
  | SystemGraphNode
  | ResourceGraphNode
  | CredentialGraphNode;

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind:
    | "calls"
    | "subworkflow-tool"
    | "webhook-handoff"
    | "shares-credential"
    | "shares-datasource"
    | "uses-system"
    | "uses-resource"
    | "uses-credential"
    | "similar"
    | "manual";
  tier: "A" | "B" | "M" | "S";
  label?: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: ProcessGroup[];
}

export interface ComposeGraphInput {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  owners: Map<string, Owner>;
  links: ManualLink[];
  groupNames: Map<string, string>;
  now: number;
  /** Hand-authored SOPs. When present they override auto-detected clusters. */
  sops?: AuthoredSop[];
}

const systemNodeId = (name: string) => `system:${name}`;

export function composeGraph(input: ComposeGraphInput): WorkflowGraph {
  const { workflows, executions, owners, links, groupNames, now, sops } = input;
  const ids = new Set(workflows.map((w) => w.id));

  const derivedGroups = computeProcessGroupsMerged(workflows, links, groupNames);
  const groups = sops?.length ? mergeAuthoredGroups(sops, derivedGroups) : derivedGroups;
  const groupByWorkflow = new Map<string, string>();
  for (const g of groups) {
    for (const wid of g.workflowIds) groupByWorkflow.set(wid, g.key);
  }

  // Workflow nodes (reuse registry derivation for type/risk/owner/health).
  const workflowNodes: WorkflowGraphNode[] = workflows.map((wf) => {
    const item = composeRegistryItem(wf, executions, owners.get(wf.id) ?? null, now);
    return {
      id: wf.id,
      kind: "workflow",
      name: item.name,
      type: item.type,
      risk: item.risk.level,
      ownerTeam: item.owner?.team ?? null,
      recentFailures: item.health.recentFailures,
      groupKey: groupByWorkflow.get(wf.id) ?? null,
    };
  });

  const edges: GraphEdge[] = [];

  // Workflow ↔ workflow relationships, from the unified detector so the graph,
  // dashboard and blast radius all read one source of truth. Each RelationshipKind
  // maps to a graph edge kind + reliability tier.
  const REL_TO_GRAPH: Record<RelationshipKind, { kind: GraphEdge["kind"]; tier: GraphEdge["tier"] }> = {
    "shared-credential": { kind: "shares-credential", tier: "A" },
    "shared-datasource": { kind: "shares-datasource", tier: "A" },
    "structural:subworkflow": { kind: "calls", tier: "A" },
    "structural:subagent": { kind: "subworkflow-tool", tier: "A" },
    "structural:webhook": { kind: "webhook-handoff", tier: "A" },
    "semantic-similar": { kind: "similar", tier: "S" },
  };
  for (const e of deriveRelationships(workflows).edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const m = REL_TO_GRAPH[e.kind];
    edges.push({
      id: `${m.kind}:${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      kind: m.kind,
      tier: m.tier,
      label: e.label,
    });
  }

  // Tier B: uses-system → deduped system nodes.
  const systemNodes = new Map<string, SystemGraphNode>();
  const seenSystemEdge = new Set<string>();
  for (const wf of workflows) {
    for (const e of systemEdges(wf)) {
      const nodeId = systemNodeId(e.system);
      if (!systemNodes.has(nodeId)) {
        systemNodes.set(nodeId, { id: nodeId, kind: "system", name: e.system });
      }
      // one edge per (workflow, system) pair even if multiple nodes touch it
      const edgeKey = `${e.workflowId}->${nodeId}`;
      if (seenSystemEdge.has(edgeKey)) continue;
      seenSystemEdge.add(edgeKey);
      edges.push({
        id: `uses:${edgeKey}`,
        source: e.workflowId,
        target: nodeId,
        kind: "uses-system",
        tier: "B",
        label: e.resource ?? undefined,
      });
    }
  }

  // Tier M: manual links between workflows in the set.
  for (const l of links) {
    if (!ids.has(l.fromId) || !ids.has(l.toId)) continue;
    edges.push({
      id: `manual:${l.id}`,
      source: l.fromId,
      target: l.toId,
      kind: "manual",
      tier: "M",
      label: l.relation,
    });
  }

  return { nodes: [...workflowNodes, ...systemNodes.values()], edges, groups };
}
