import type { N8nWorkflow, N8nExecution, WorkflowType } from "@/lib/n8n/types";
import type { Owner, ManualLink } from "@/lib/backoffice/types";
import { composeRegistryItem } from "./registry";
import {
  workflowCallEdges,
  sharedCredentialEdges,
  systemEdges,
} from "./edges";
import { computeProcessGroupsMerged, type ProcessGroup } from "./process";

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
    | "shares-credential"
    | "uses-system"
    | "uses-resource"
    | "uses-credential"
    | "manual";
  tier: "A" | "B" | "M";
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
}

const systemNodeId = (name: string) => `system:${name}`;

export function composeGraph(input: ComposeGraphInput): WorkflowGraph {
  const { workflows, executions, owners, links, groupNames, now } = input;
  const ids = new Set(workflows.map((w) => w.id));

  const groups = computeProcessGroupsMerged(workflows, links, groupNames);
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

  // Tier A: workflow → workflow (Execute Workflow). Skip dangling targets.
  for (const wf of workflows) {
    for (const e of workflowCallEdges(wf)) {
      if (!ids.has(e.to)) continue;
      edges.push({ id: `calls:${e.from}->${e.to}`, source: e.from, target: e.to, kind: "calls", tier: "A" });
    }
  }

  // Tier A: shared credential (already one edge per pair).
  for (const e of sharedCredentialEdges(workflows)) {
    edges.push({
      id: `cred:${e.credentialId}:${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      kind: "shares-credential",
      tier: "A",
      label: e.credentialName,
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
