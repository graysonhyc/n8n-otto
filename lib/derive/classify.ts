import type {
  Classification,
  N8nNode,
  N8nWorkflow,
  TriggerKind,
  WorkflowType,
} from "@/lib/n8n/types";
import { integrationForNode } from "./integrations";

const LANGCHAIN_PREFIX = "@n8n/n8n-nodes-langchain.";
const AGENT_TYPE = "@n8n/n8n-nodes-langchain.agent";

// Explicit trigger node types → trigger kind.
const TRIGGER_KINDS: Record<string, TriggerKind> = {
  "n8n-nodes-base.scheduleTrigger": "schedule",
  "n8n-nodes-base.cron": "schedule",
  "n8n-nodes-base.intervalTrigger": "schedule",
  "n8n-nodes-base.webhook": "webhook",
  "n8n-nodes-base.manualTrigger": "manual",
  "n8n-nodes-base.formTrigger": "form",
  "@n8n/n8n-nodes-langchain.chatTrigger": "chat",
  "n8n-nodes-base.executeWorkflowTrigger": "sub-workflow",
};

const HUMAN_IN_LOOP_TYPES = new Set([
  "n8n-nodes-base.wait",
  "n8n-nodes-base.approvalTrigger",
]);

/** Short node "base" name, e.g. "n8n-nodes-base.stripeTool" → "stripeTool". */
function baseName(type: string): string {
  return type.split(".").pop() ?? type;
}

// Generic detection (node type + credential type + sub-nodes), shared with the
// relationship graph. Covers any service, not a hardcoded allow-list.
const systemForNode = integrationForNode;

/** Find node names connected to an agent via `ai_tool` connections. */
function findAgentTools(workflow: N8nWorkflow): string[] {
  const agents = new Set(
    workflow.nodes.filter((n) => n.type === AGENT_TYPE).map((n) => n.name),
  );
  if (agents.size === 0) return [];
  const tools: string[] = [];
  for (const [sourceName, byType] of Object.entries(workflow.connections)) {
    const aiTool = byType.ai_tool;
    if (!aiTool) continue;
    const feedsAgent = aiTool.some((group) =>
      group.some((t) => agents.has(t.node)),
    );
    if (feedsAgent) tools.push(sourceName);
  }
  return tools;
}

function detectTrigger(workflow: N8nWorkflow): Classification["trigger"] {
  for (const node of workflow.nodes) {
    if (TRIGGER_KINDS[node.type]) {
      return { kind: TRIGGER_KINDS[node.type], nodeType: node.type };
    }
  }
  // App triggers (stripeTrigger, etc.) are event/webhook style.
  const appTrigger = workflow.nodes.find((n) => baseName(n.type).endsWith("Trigger"));
  if (appTrigger) return { kind: "webhook", nodeType: appTrigger.type };
  return { kind: "unknown", nodeType: null };
}

function detectModel(workflow: N8nWorkflow): string | null {
  const lm = workflow.nodes.find(
    (n) => n.type.startsWith(LANGCHAIN_PREFIX) && baseName(n.type).startsWith("lmChat"),
  );
  const model = lm?.parameters?.model;
  return typeof model === "string" ? model : null;
}

export function classify(workflow: N8nWorkflow): Classification {
  const hasAgent = workflow.nodes.some((n) => n.type === AGENT_TYPE);
  const usesAI = workflow.nodes.some((n) => n.type.startsWith(LANGCHAIN_PREFIX));
  const humanInLoop = workflow.nodes.some((n) => HUMAN_IN_LOOP_TYPES.has(n.type));
  const toolNames = findAgentTools(workflow);

  const systems = Array.from(
    new Set(
      workflow.nodes.map(systemForNode).filter((s): s is string => s !== null),
    ),
  );

  // Note: `humanInLoop` (a wait/approval node) is still surfaced as a flag on
  // the classification, but it no longer forms its own type — such workflows
  // fall through to ai-assisted or deterministic based on AI usage.
  let type: WorkflowType;
  if (hasAgent && toolNames.length > 0) type = "ai-agent-tools";
  else if (usesAI) type = "ai-assisted";
  else type = "deterministic";

  return {
    type,
    usesAI,
    hasAgent,
    humanInLoop,
    toolNames,
    systems,
    trigger: detectTrigger(workflow),
    model: detectModel(workflow),
  };
}
