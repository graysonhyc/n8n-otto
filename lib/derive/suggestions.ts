import { createHash } from "node:crypto";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { clusterByPairs, callProcessPairs } from "./process";
import { sharedDataSourceGroups } from "./edges";

export type SuggestionConfidence = "strong" | "possible";
export type SuggestionKind = "new-sop" | "add-to-sop";

/** Why a set of workflows is connected — the deterministic ground truth. */
export interface ClusterBasis {
  viaCalls: boolean; // one workflow calls another (Execute Workflow)
  sharedResource: { system: string; name: string } | null; // same sheet/table/channel
}

export interface SopSuggestion {
  id: string; // stable: hash(sorted memberIds + kind + targetSopId)
  kind: SuggestionKind;
  confidence: SuggestionConfidence;
  memberIds: string[]; // sorted; for add-to-sop, the MISSING members only
  reason: string; // short deterministic label (fallback / Slack notification text)
  targetSopId: string | null; // set iff add-to-sop
  targetSopName: string | null;
  basis: ClusterBasis;
  // Enrichment attached by the server layer (lib/data/suggestions). Optional so
  // the pure classifier stays LLM-free and unit-testable.
  memberNames?: string[];
  rationale?: string; // LLM (or deterministic-fallback) "why this is an SOP"
  factLine?: string; // deterministic ground-truth footer
}

export interface Cluster {
  memberIds: string[];
  confidence: SuggestionConfidence;
  reason: string;
  basis: ClusterBasis;
}

export interface SuggestionInput {
  clusters: Cluster[];
  sopByWorkflow: Map<string, { id: string; name: string }>; // workflowId -> its SOP
  dismissed: Set<string>; // suggestion ids already dismissed
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function suggestionId(memberIds: string[], kind: SuggestionKind, targetSopId: string | null): string {
  const canon = [...memberIds].sort().join("|");
  return createHash("sha1").update(`${kind}::${targetSopId ?? ""}::${canon}`).digest("hex").slice(0, 16);
}

/**
 * Classify each connected cluster against current SOP membership:
 *   - no member assigned                       -> new-sop
 *   - some in exactly one SOP, rest unassigned -> add-to-sop (missing members only)
 *   - members span >=2 SOPs, or nothing missing -> skip
 * Dismissed suggestion ids are filtered out. Strong confidence sorts first.
 */
export function classifySuggestions(input: SuggestionInput): SopSuggestion[] {
  const out: SopSuggestion[] = [];
  for (const cluster of input.clusters) {
    const members = [...cluster.memberIds].sort();
    const sops = new Map<string, string>(); // sopId -> name, among assigned members
    for (const id of members) {
      const sop = input.sopByWorkflow.get(id);
      if (sop) sops.set(sop.id, sop.name);
    }

    if (sops.size > 1) continue; // ambiguous — spans multiple SOPs

    let s: SopSuggestion;
    if (sops.size === 0) {
      const id = suggestionId(members, "new-sop", null);
      s = {
        id,
        kind: "new-sop",
        confidence: cluster.confidence,
        memberIds: members,
        reason: cluster.reason,
        targetSopId: null,
        targetSopName: null,
        basis: cluster.basis,
      };
    } else {
      const [targetSopId, targetSopName] = [...sops.entries()][0];
      const missing = members.filter((id) => !input.sopByWorkflow.has(id));
      if (missing.length === 0) continue; // nothing to add
      const id = suggestionId(missing, "add-to-sop", targetSopId);
      s = {
        id,
        kind: "add-to-sop",
        confidence: cluster.confidence,
        memberIds: missing,
        reason: cluster.reason,
        targetSopId,
        targetSopName,
        basis: cluster.basis,
      };
    }
    if (!input.dismissed.has(s.id)) out.push(s);
  }

  return out.sort((a, b) =>
    a.confidence === b.confidence ? a.id.localeCompare(b.id) : a.confidence === "strong" ? -1 : 1,
  );
}

/**
 * Build connected clusters from two deterministic signals:
 *   - Execute-Workflow call edges (tier A) -> strong
 *   - workflows sharing the same data-source resource (tier B) -> possible
 * A cluster is strong if any intra-cluster pair is a call edge, else possible.
 * Only clusters of >=2 workflows are returned.
 */
export function buildClusters(workflows: N8nWorkflow[]): Cluster[] {
  const callPairs = callProcessPairs(workflows);
  const callSet = new Set(callPairs.map(([a, b]) => pairKey(a, b)));

  const dsGroups = sharedDataSourceGroups(workflows);
  const dsPairs: Array<[string, string]> = [];
  for (const g of dsGroups) {
    const [head, ...rest] = g.workflowIds;
    for (const id of rest) dsPairs.push([head, id]);
  }

  const groups = clusterByPairs([...callPairs, ...dsPairs], new Map());

  return groups
    .filter((grp) => grp.workflowIds.length >= 2)
    .map((grp) => {
      const ids = grp.workflowIds;
      const idSet = new Set(ids);
      let viaCalls = false;
      for (let i = 0; i < ids.length && !viaCalls; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (callSet.has(pairKey(ids[i], ids[j]))) {
            viaCalls = true;
            break;
          }
        }
      }
      // The shared resource behind this cluster: a data-source group fully inside it.
      const dsg = dsGroups.find((g) => g.workflowIds.every((w) => idSet.has(w)));
      const sharedResource = dsg ? { system: dsg.system, name: dsg.resourceName } : null;

      const reason = viaCalls
        ? `${ids.length} workflows call each other`
        : sharedResource
          ? `share ${sharedResource.system}: ${sharedResource.name}`
          : "share a data source";

      return {
        memberIds: ids,
        confidence: viaCalls ? ("strong" as const) : ("possible" as const),
        reason,
        basis: { viaCalls, sharedResource },
      };
    });
}
