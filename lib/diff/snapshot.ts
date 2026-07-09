import { createHash } from "node:crypto";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { classify } from "@/lib/derive/classify";
import { agentToolEdges } from "@/lib/derive/edges";

// Change-relevant fields, captured so the next sync can diff against them.
export interface SnapshotFields {
  active: boolean;
  trigger: string | null;
  model: string | null;
  prompts: Record<string, string>; // node name → system message
  tools: string[]; // sorted tool node names
  credentials: string[]; // sorted credential ids
  structure: string; // fingerprint of the connection graph (source→target edges)
}

export type ChangeEvent =
  | { kind: "prompt"; node: string; old: string; new: string }
  | { kind: "model"; old: string | null; new: string | null }
  | { kind: "tool-access"; added: string[]; removed: string[] }
  | { kind: "trigger"; old: string | null; new: string | null }
  | { kind: "active"; old: boolean; new: boolean }
  | { kind: "credential"; added: string[]; removed: string[] }
  | { kind: "structure" };

function extractPrompts(workflow: N8nWorkflow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of workflow.nodes) {
    const msg = (node.parameters?.options as { systemMessage?: string } | undefined)
      ?.systemMessage;
    if (typeof msg === "string") out[node.name] = msg;
  }
  return out;
}

function extractCredentials(workflow: N8nWorkflow): string[] {
  const ids = new Set<string>();
  for (const node of workflow.nodes) {
    for (const ref of Object.values(node.credentials ?? {})) ids.add(ref.id);
  }
  return [...ids].sort();
}

function structureFingerprint(workflow: N8nWorkflow): string {
  const edges: string[] = [];
  for (const [source, byType] of Object.entries(workflow.connections)) {
    for (const [type, groups] of Object.entries(byType)) {
      for (const group of groups) {
        for (const t of group) edges.push(`${source}>${t.node}:${type}`);
      }
    }
  }
  return edges.sort().join("|");
}

export function snapshotFields(workflow: N8nWorkflow): SnapshotFields {
  const c = classify(workflow);
  return {
    active: workflow.active,
    trigger: c.trigger.nodeType,
    model: c.model,
    prompts: extractPrompts(workflow),
    tools: agentToolEdges(workflow)
      .map((e) => e.to)
      .sort(),
    credentials: extractCredentials(workflow),
    structure: structureFingerprint(workflow),
  };
}

export function snapshot(workflow: N8nWorkflow): { hash: string; fields: SnapshotFields } {
  const fields = snapshotFields(workflow);
  const hash = createHash("sha1").update(JSON.stringify(fields)).digest("hex");
  return { hash, fields };
}

function setDiff(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const p = new Set(prev);
  const n = new Set(next);
  return {
    added: next.filter((x) => !p.has(x)),
    removed: prev.filter((x) => !n.has(x)),
  };
}

export function diffFields(prev: SnapshotFields, next: SnapshotFields): ChangeEvent[] {
  const events: ChangeEvent[] = [];

  for (const node of Object.keys({ ...prev.prompts, ...next.prompts })) {
    const oldP = prev.prompts[node];
    const newP = next.prompts[node];
    if (oldP !== undefined && newP !== undefined && oldP !== newP) {
      events.push({ kind: "prompt", node, old: oldP, new: newP });
    }
  }

  if (prev.model !== next.model) {
    events.push({ kind: "model", old: prev.model, new: next.model });
  }

  const tools = setDiff(prev.tools, next.tools);
  if (tools.added.length || tools.removed.length) {
    events.push({ kind: "tool-access", ...tools });
  }

  if (prev.trigger !== next.trigger) {
    events.push({ kind: "trigger", old: prev.trigger, new: next.trigger });
  }

  if (prev.active !== next.active) {
    events.push({ kind: "active", old: prev.active, new: next.active });
  }

  const creds = setDiff(prev.credentials, next.credentials);
  if (creds.added.length || creds.removed.length) {
    events.push({ kind: "credential", ...creds });
  }

  if (prev.structure !== next.structure) {
    events.push({ kind: "structure" });
  }

  return events;
}

export function diffWorkflows(prev: N8nWorkflow, next: N8nWorkflow): ChangeEvent[] {
  return diffFields(snapshotFields(prev), snapshotFields(next));
}
