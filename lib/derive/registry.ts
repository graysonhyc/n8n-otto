import type { N8nExecution, N8nWorkflow, WorkflowType, TriggerKind } from "@/lib/n8n/types";
import type { Owner } from "@/lib/backoffice/types";
import { classify } from "./classify";
import { unreachableNodes } from "./structure";

export interface Health {
  recentFailures: number;
  lastStatus: N8nExecution["status"] | "unknown";
}

export interface RiskAssessment {
  level: "high" | "medium" | "low";
  label: string;
  reasons: string[];
}

export interface RegistryItem {
  id: string;
  name: string;
  type: WorkflowType;
  usesAI: boolean;
  hasAgent: boolean;
  humanInLoop: boolean;
  hasToolAccess: boolean;
  systems: string[];
  trigger: TriggerKind;
  model: string | null;
  toolNames: string[];
  active: boolean;
  tags: string[];
  owner: Owner | null;
  criticality: "High" | "Medium" | "Low";
  health: Health;
  risk: RiskAssessment;
  lastChange: string | null;
  project: string | null;
  disconnectedNodes: string[];
}

// Systems that touch customers / money → raise criticality.
const CUSTOMER_FACING = new Set(["Stripe", "Zendesk", "HubSpot", "Gmail", "Intercom", "Salesforce"]);

// Days without an edit before a workflow is considered stale.
const STALE_DAYS = 60;

function computeHealth(executions: N8nExecution[], workflowId: string): Health {
  const mine = executions
    .filter((e) => e.workflowId === workflowId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return {
    recentFailures: mine.filter((e) => e.status === "error" || e.status === "crashed").length,
    lastStatus: mine[0]?.status ?? "unknown",
  };
}

function computeCriticality(item: {
  active: boolean;
  systems: string[];
}): RegistryItem["criticality"] {
  const touchesCustomer = item.systems.some((s) => CUSTOMER_FACING.has(s));
  if (item.active && touchesCustomer) return "High";
  if (item.active) return "Medium";
  return "Low";
}

function isStale(lastChange: string | null, now: number): boolean {
  if (!lastChange) return false;
  const ageDays = (now - new Date(lastChange).getTime()) / 86_400_000;
  return ageDays > STALE_DAYS;
}

function assessRisk(input: {
  type: WorkflowType;
  hasToolAccess: boolean;
  active: boolean;
  owner: Owner | null;
  health: Health;
  humanInLoop: boolean;
  stale: boolean;
  systems: string[];
  disconnectedCount: number;
}): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (input.disconnectedCount > 0) {
    score += 2;
    reasons.push(
      `${input.disconnectedCount} disconnected node(s) — steps may be skipped silently`,
    );
  }

  if (input.active && input.type === "ai-agent-tools" && !input.humanInLoop) {
    score += 2;
    reasons.push("AI agent with tool access and no human review");
  }
  if (!input.owner) {
    score += 2;
    reasons.push("No owner assigned");
  }
  if (input.health.recentFailures >= 3) {
    score += 2;
    reasons.push(`${input.health.recentFailures} recent failures`);
  }
  if (input.stale && input.active && input.systems.length > 0) {
    score += 1;
    reasons.push("Stale but still has production access");
  }

  const level = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  const label = level === "high" ? "Risky" : level === "medium" ? "Watch" : "Healthy";
  if (reasons.length === 0) reasons.push("No outstanding issues");
  return { level, label, reasons };
}

export function composeRegistryItem(
  workflow: N8nWorkflow,
  executions: N8nExecution[],
  owner: Owner | null,
  now: number,
): RegistryItem {
  const c = classify(workflow);
  const health = computeHealth(executions, workflow.id);
  const disconnectedNodes = unreachableNodes(workflow);
  const hasToolAccess = c.toolNames.length > 0;
  const lastChange = workflow.updatedAt ?? null;
  const stale = isStale(lastChange, now);
  const criticality = computeCriticality({ active: workflow.active, systems: c.systems });

  return {
    id: workflow.id,
    name: workflow.name,
    type: c.type,
    usesAI: c.usesAI,
    hasAgent: c.hasAgent,
    humanInLoop: c.humanInLoop,
    hasToolAccess,
    systems: c.systems,
    trigger: c.trigger.kind,
    model: c.model,
    toolNames: c.toolNames,
    active: workflow.active,
    tags: (workflow.tags ?? []).map((t) => t.name),
    owner,
    criticality,
    health,
    risk: assessRisk({
      type: c.type,
      hasToolAccess,
      active: workflow.active,
      owner,
      health,
      humanInLoop: c.humanInLoop,
      stale,
      systems: c.systems,
      disconnectedCount: disconnectedNodes.length,
    }),
    lastChange,
    project: workflow.homeProject?.name ?? null,
    disconnectedNodes,
  };
}

export function composeRegistry(input: {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  owners: Map<string, Owner>;
  now?: number;
}): RegistryItem[] {
  const now = input.now ?? Date.parse("2026-07-09T15:00:00.000Z");
  return input.workflows.map((wf) =>
    composeRegistryItem(wf, input.executions, input.owners.get(wf.id) ?? null, now),
  );
}
