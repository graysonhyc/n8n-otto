import type { N8nWorkflow } from "@/lib/n8n/types";

// Relationship edges, tagged by reliability tier:
//   A = exact (from workflow structure), B/C = heuristic (shown as "possible").

export interface CallEdge {
  from: string; // workflow id
  to: string; // workflow id
  kind: "calls";
  tier: "A";
}

export interface AgentToolEdge {
  from: string; // agent node name
  to: string; // tool node name
  kind: "agent-tool";
  tier: "A";
}

export interface SharedCredentialEdge {
  from: string; // workflow id
  to: string; // workflow id
  credentialId: string;
  credentialName: string;
  kind: "shares-credential";
  tier: "A";
}

export interface SystemEdge {
  workflowId: string;
  system: string;
  resource: string | null; // e.g. "#cs-alerts" or a table name
  kind: "uses-system";
  tier: "B";
}

const AGENT_TYPE = "@n8n/n8n-nodes-langchain.agent";
const EXECUTE_WORKFLOW_TYPE = "n8n-nodes-base.executeWorkflow";

function baseName(type: string): string {
  return type.split(".").pop() ?? type;
}

/** Extract the referenced workflow id from an Execute Workflow node's parameters. */
function referencedWorkflowId(params: Record<string, unknown> | undefined): string | null {
  const wf = params?.workflowId;
  if (typeof wf === "string") return wf;
  if (wf && typeof wf === "object" && "value" in wf) {
    const v = (wf as { value: unknown }).value;
    if (typeof v === "string") return v;
  }
  return null;
}

export function workflowCallEdges(workflow: N8nWorkflow): CallEdge[] {
  const edges: CallEdge[] = [];
  for (const node of workflow.nodes) {
    if (node.type !== EXECUTE_WORKFLOW_TYPE) continue;
    const to = referencedWorkflowId(node.parameters);
    if (to) edges.push({ from: workflow.id, to, kind: "calls", tier: "A" });
  }
  return edges;
}

export function agentToolEdges(workflow: N8nWorkflow): AgentToolEdge[] {
  const agents = new Set(
    workflow.nodes.filter((n) => n.type === AGENT_TYPE).map((n) => n.name),
  );
  const edges: AgentToolEdge[] = [];
  for (const [sourceName, byType] of Object.entries(workflow.connections)) {
    const aiTool = byType.ai_tool;
    if (!aiTool) continue;
    for (const group of aiTool) {
      for (const target of group) {
        if (agents.has(target.node)) {
          edges.push({ from: target.node, to: sourceName, kind: "agent-tool", tier: "A" });
        }
      }
    }
  }
  return edges;
}

/** Credential id → list of workflow ids that use it. */
function credentialUsage(workflows: N8nWorkflow[]): Map<string, { name: string; ids: Set<string> }> {
  const usage = new Map<string, { name: string; ids: Set<string> }>();
  for (const wf of workflows) {
    for (const node of wf.nodes) {
      for (const ref of Object.values(node.credentials ?? {})) {
        const entry = usage.get(ref.id) ?? { name: ref.name, ids: new Set<string>() };
        entry.ids.add(wf.id);
        usage.set(ref.id, entry);
      }
    }
  }
  return usage;
}

export interface CredentialGroup {
  credentialId: string;
  credentialName: string;
  workflowIds: string[];
}

/** All credentials with the list of workflows that use them (for shared-resource risk). */
export function credentialGroups(workflows: N8nWorkflow[]): CredentialGroup[] {
  const usage = credentialUsage(workflows);
  return [...usage.entries()].map(([credentialId, { name, ids }]) => ({
    credentialId,
    credentialName: name,
    workflowIds: [...ids].sort(),
  }));
}

export function sharedCredentialEdges(workflows: N8nWorkflow[]): SharedCredentialEdge[] {
  const usage = credentialUsage(workflows);
  const edges: SharedCredentialEdge[] = [];
  for (const [credentialId, { name, ids }] of usage) {
    const list = [...ids].sort();
    if (list.length < 2) continue;
    // one edge per unique pair
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        edges.push({
          from: list[i],
          to: list[j],
          credentialId,
          credentialName: name,
          kind: "shares-credential",
          tier: "A",
        });
      }
    }
  }
  return edges;
}

const SYSTEM_BY_NODE: Record<string, string> = {
  slack: "Slack",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  stripe: "Stripe",
  stripeTrigger: "Stripe",
  zendesk: "Zendesk",
  gmail: "Gmail",
  googleBigQuery: "BigQuery",
  postgres: "Postgres",
  notion: "Notion",
};

/** Resource identifier within a system, when the node params reveal one. */
function resourceKey(params: Record<string, unknown> | undefined): string | null {
  if (!params) return null;
  for (const key of ["channel", "channelId", "table", "sheetId", "documentId"]) {
    const v = params[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export function systemEdges(workflow: N8nWorkflow): SystemEdge[] {
  const edges: SystemEdge[] = [];
  for (const node of workflow.nodes) {
    const base = baseName(node.type);
    const normalized = base.endsWith("Tool") ? base.slice(0, -4) : base;
    const system = SYSTEM_BY_NODE[normalized];
    if (!system) continue;
    edges.push({
      workflowId: workflow.id,
      system,
      resource: resourceKey(node.parameters),
      kind: "uses-system",
      tier: "B",
    });
  }
  return edges;
}
