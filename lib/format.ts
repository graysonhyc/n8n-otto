import type { Tone } from "@/components/ui/Pill";
import type { RiskAssessment, RegistryItem } from "@/lib/derive/registry";
import type { WorkflowType, TriggerKind } from "@/lib/n8n/types";

export const TYPE_LABEL: Record<WorkflowType, string> = {
  deterministic: "Workflow",
  "ai-assisted": "AI-assisted",
  "ai-agent-tools": "AI agent",
};

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  schedule: "Schedule",
  webhook: "Webhook",
  manual: "Manual",
  form: "Form",
  chat: "Chat",
  "sub-workflow": "Sub-workflow",
  unknown: "—",
};

export function typeTone(type: WorkflowType): Tone {
  return type === "deterministic" ? "neutral" : "ai";
}

export function riskTone(risk: RiskAssessment): Tone {
  return risk.level === "high" ? "danger" : risk.level === "medium" ? "warn" : "ok";
}

export function criticalityTone(c: RegistryItem["criticality"]): Tone {
  return c === "High" ? "danger" : c === "Medium" ? "warn" : "neutral";
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const diff = now - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export const RELATION_LABEL: Record<string, string> = {
  "depends-on": "depends on",
  triggers: "triggers",
  "duplicate-of": "duplicate of",
  "part-of-process": "part of process",
  "shares-data-with": "shares data with",
};
