import type { N8nWorkflow } from "@/lib/n8n/types";
import {
  sharedCredentialEdges,
  sharedDataSourceGroups,
  workflowCallEdges,
  subworkflowToolEdges,
  webhookHandoffEdges,
  credentialGroups,
} from "./edges";

// A single, tagged relationship between two workflows. Every relationship signal
// in the estate reduces to one of these kinds, so the dashboard, blast radius and
// Otto all read one vocabulary instead of ad-hoc per-signal shapes.
export type RelationshipKind =
  | "shared-credential"
  | "shared-datasource"
  | "structural:subworkflow" // Execute-Workflow call
  | "structural:subagent" // sub-workflow exposed to an agent as a tool
  | "structural:webhook" // one workflow's HTTP target is another's trigger
  | "semantic-similar"; // near-duplicate job (embeddings; added by the semantic module)

// Reliability tier: A = exact from structure, B = heuristic, S = semantic (probabilistic).
export type RelationshipTier = "A" | "B" | "S";

export interface RelationshipEdge {
  from: string; // workflow id
  to: string; // workflow id
  kind: RelationshipKind;
  tier: RelationshipTier;
  label?: string; // credential name, resource name, similarity note…
  score?: number; // 0..1, semantic only
}

export interface RelationshipSummary {
  integrationCount: number; // distinct credentials used across the estate
  sharedCredentialCount: number; // credentials used by >=2 workflows (coupling risk)
  connectionCount: number; // deterministic structural edges (sub-call / sub-agent / webhook)
  dataSourceLinkCount: number; // shared-datasource edges
  duplicateCount: number; // semantic-similar edges (0 until the module runs)
}

const STRUCTURAL_KINDS = new Set<RelationshipKind>([
  "structural:subworkflow",
  "structural:subagent",
  "structural:webhook",
]);

/** Expand a group of ≥2 workflow ids into one edge per unordered pair. */
function pairEdges(
  ids: string[],
  make: (a: string, b: string) => RelationshipEdge,
): RelationshipEdge[] {
  const out: RelationshipEdge[] = [];
  const sorted = [...ids].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) out.push(make(sorted[i], sorted[j]));
  }
  return out;
}

/**
 * All deterministic workflow↔workflow relationships in the estate, plus a summary.
 * Signals 1 (shared-credential), 2 (shared-datasource) and 4 (structural). The
 * semantic module (signal 3) appends its edges separately so it stays cuttable —
 * see `withSemanticEdges`.
 */
export function deriveRelationships(workflows: N8nWorkflow[]): {
  edges: RelationshipEdge[];
  summary: RelationshipSummary;
} {
  const edges: RelationshipEdge[] = [];
  const ids = new Set(workflows.map((w) => w.id));

  // 1 — shared credential (already one edge per pair).
  for (const e of sharedCredentialEdges(workflows)) {
    edges.push({
      from: e.from,
      to: e.to,
      kind: "shared-credential",
      tier: "A",
      label: e.credentialName,
    });
  }

  // 2 — shared data source (same resource id): expand each hub into pairs.
  let dataSourceLinkCount = 0;
  for (const g of sharedDataSourceGroups(workflows)) {
    const es = pairEdges(g.workflowIds, (a, b) => ({
      from: a,
      to: b,
      kind: "shared-datasource",
      tier: "A",
      label: `${g.system}: ${g.resourceName}`,
    }));
    dataSourceLinkCount += es.length;
    edges.push(...es);
  }

  // 4a — Execute-Workflow sub-call.
  for (const wf of workflows) {
    for (const e of workflowCallEdges(wf)) {
      if (!ids.has(e.to)) continue;
      edges.push({ from: e.from, to: e.to, kind: "structural:subworkflow", tier: "A" });
    }
  }

  // 4b — sub-workflow exposed to an agent as a tool.
  for (const wf of workflows) {
    for (const e of subworkflowToolEdges(wf)) {
      if (!ids.has(e.to)) continue;
      edges.push({ from: e.from, to: e.to, kind: "structural:subagent", tier: "A" });
    }
  }

  // 4c — webhook / trigger hand-off (runtime dependency, no static call edge).
  for (const e of webhookHandoffEdges(workflows)) {
    edges.push({ from: e.from, to: e.to, kind: "structural:webhook", tier: "A" });
  }

  const groups = credentialGroups(workflows);
  const summary: RelationshipSummary = {
    integrationCount: groups.length,
    sharedCredentialCount: groups.filter((g) => g.workflowIds.length >= 2).length,
    connectionCount: edges.filter((e) => STRUCTURAL_KINDS.has(e.kind)).length,
    dataSourceLinkCount,
    duplicateCount: edges.filter((e) => e.kind === "semantic-similar").length,
  };

  return { edges, summary };
}
