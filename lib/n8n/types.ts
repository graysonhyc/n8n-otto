// Shapes returned by the n8n public REST API (subset we use), plus our derived types.

export interface N8nCredentialRef {
  id: string;
  name: string;
}

export interface N8nNode {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialRef>;
  disabled?: boolean;
}

export interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

// connections is keyed by SOURCE node name → connection type → array of arrays of targets.
export type N8nConnections = Record<
  string,
  Record<string, N8nConnectionTarget[][]>
>;

export interface N8nTag {
  id?: string;
  name: string;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: N8nConnections;
  tags?: N8nTag[];
  createdAt?: string;
  updatedAt?: string;
  // n8n includes owner/project info on some endpoints:
  homeProject?: { id: string; name: string } | null;
  // Workflow settings. `timeSavedPerExecution` (minutes) is the native n8n
  // Insights field an owner sets to estimate time saved per production run.
  settings?: { timeSavedPerExecution?: number };
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  finished: boolean;
  status: "success" | "error" | "waiting" | "running" | "canceled" | "crashed";
  startedAt: string;
  stoppedAt?: string;
}

// ---- Derived ---------------------------------------------------------------

export type WorkflowType =
  | "deterministic"
  | "ai-assisted"
  | "ai-agent-tools"
  | "human-in-loop";

export type TriggerKind =
  | "schedule"
  | "webhook"
  | "manual"
  | "form"
  | "chat"
  | "sub-workflow"
  | "unknown";

export interface Classification {
  type: WorkflowType;
  usesAI: boolean;
  hasAgent: boolean;
  humanInLoop: boolean;
  toolNames: string[];
  systems: string[];
  trigger: { kind: TriggerKind; nodeType: string | null };
  model: string | null;
}
