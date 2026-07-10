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
const TOOL_WORKFLOW_TYPE = "@n8n/n8n-nodes-langchain.toolWorkflow";

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

export interface SubworkflowToolEdge {
  from: string; // caller (agent-hosting) workflow id
  to: string; // referenced sub-workflow id, exposed as a tool
  kind: "subworkflow-tool";
  tier: "A";
}

/**
 * Subworkflows exposed to an agent as a tool: a `toolWorkflow` (or Execute
 * Workflow) node wired via an `ai_tool` connection into an agent node, and
 * referencing another workflow id. This is a cross-workflow dependency, unlike
 * `agentToolEdges` (which is node→agent within one workflow).
 */
export function subworkflowToolEdges(workflow: N8nWorkflow): SubworkflowToolEdge[] {
  const agents = new Set(
    workflow.nodes.filter((n) => n.type === AGENT_TYPE).map((n) => n.name),
  );
  if (agents.size === 0) return [];

  // node name → referenced workflow id, for tool-capable nodes only.
  const refByNode = new Map<string, string>();
  for (const node of workflow.nodes) {
    if (node.type !== TOOL_WORKFLOW_TYPE && node.type !== EXECUTE_WORKFLOW_TYPE) continue;
    const ref = referencedWorkflowId(node.parameters);
    if (ref) refByNode.set(node.name, ref);
  }

  const edges: SubworkflowToolEdge[] = [];
  const seen = new Set<string>();
  for (const [sourceName, byType] of Object.entries(workflow.connections)) {
    if (!byType.ai_tool) continue;
    const to = refByNode.get(sourceName);
    if (!to || seen.has(to)) continue;
    const feedsAgent = byType.ai_tool.some((group) =>
      group.some((t) => agents.has(t.node)),
    );
    if (feedsAgent) {
      seen.add(to);
      edges.push({ from: workflow.id, to, kind: "subworkflow-tool", tier: "A" });
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
  googleSheets: "Google Sheets",
  postgres: "Postgres",
  notion: "Notion",
};

/** Resource identifier within a system, when the node params reveal one. */
// A resource param is either a plain string or an n8n resource-locator object
// ({ __rl: true, value, mode }). Unwrap the latter to its id, like
// `referencedWorkflowId` does for Execute-Workflow targets.
function resolveResource(v: unknown): string | null {
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (v && typeof v === "object" && "value" in v) {
    const inner = (v as { value: unknown }).value;
    if (typeof inner === "string" && inner.length > 0) return inner;
  }
  return null;
}

const RESOURCE_KEYS = ["channel", "channelId", "table", "sheetId", "documentId"];

function resourceKey(params: Record<string, unknown> | undefined): string | null {
  if (!params) return null;
  for (const key of RESOURCE_KEYS) {
    const r = resolveResource(params[key]);
    if (r) return r;
  }
  return null;
}

// The human label n8n caches for a resource-locator (e.g. a sheet's title),
// used for display where the raw id is meaningless. Null when absent.
function resourceDisplayName(params: Record<string, unknown> | undefined): string | null {
  if (!params) return null;
  for (const key of RESOURCE_KEYS) {
    const v = params[key];
    if (v && typeof v === "object" && "cachedResultName" in v) {
      const name = (v as { cachedResultName: unknown }).cachedResultName;
      if (typeof name === "string" && name.length > 0) return name;
    }
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

export interface DataSourceGroup {
  id: string; // "res:<system>:<resource>"
  system: string;
  resource: string; // the raw id (stable key)
  resourceName: string; // human label (cachedResultName) or the raw id if none
  workflowIds: string[]; // sorted, length >= 2
}

/**
 * Workflows that read/write the SAME specific resource (a Google Sheet document,
 * a Slack channel, a DB table…), grouped into one hub. Only resources touched by
 * ≥2 workflows are returned — that shared touch is the relationship. Deterministic:
 * the resource id comes straight from node parameters via `resourceKey`.
 */
export function sharedDataSourceGroups(workflows: N8nWorkflow[]): DataSourceGroup[] {
  const byRes = new Map<string, { system: string; resource: string; name: string | null; ids: Set<string> }>();
  for (const wf of workflows) {
    for (const node of wf.nodes) {
      const base = baseName(node.type);
      const normalized = base.endsWith("Tool") ? base.slice(0, -4) : base;
      const system = SYSTEM_BY_NODE[normalized];
      const resource = resourceKey(node.parameters);
      if (!system || !resource) continue;
      const key = `res:${system}:${resource}`;
      const entry = byRes.get(key) ?? { system, resource, name: null, ids: new Set<string>() };
      entry.name = entry.name ?? resourceDisplayName(node.parameters);
      entry.ids.add(wf.id);
      byRes.set(key, entry);
    }
  }
  return [...byRes.entries()]
    .filter(([, v]) => v.ids.size >= 2)
    .map(([id, v]) => ({
      id,
      system: v.system,
      resource: v.resource,
      resourceName: v.name ?? v.resource,
      workflowIds: [...v.ids].sort(),
    }));
}
