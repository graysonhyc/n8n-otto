import type { N8nWorkflow, N8nExecution } from "@/lib/n8n/types";
import type { Owner, ManualLink } from "@/lib/backoffice/types";
import type { ChangeEvent } from "@/lib/diff/snapshot";
import { composeRegistry, type RegistryItem } from "@/lib/derive/registry";
import { composeGraph, type WorkflowGraph } from "@/lib/derive/graph";
import { credentialGroups } from "@/lib/derive/edges";
import { blastRadius } from "@/lib/derive/blast";
import { buildBrief, type BriefItem } from "@/lib/brief/build";
import type { AuthoredSop } from "@/lib/derive/process";
import type { SimilarPair } from "@/lib/derive/similarity";

// The single snapshot every agent tool reads from during one turn: the
// business-readable registry, the dependency graph (which carries the edges +
// process groups that blast-radius needs), and the ranked attention items (the
// same "what needs attention" list the daily brief surfaces) so the agent can
// answer brief questions. Composed once so tools never re-derive or re-fetch.
export interface AgentContext {
  items: RegistryItem[];
  graph: WorkflowGraph;
  executions: N8nExecution[];
  attention: BriefItem[];
  live: boolean;
  now: number;
}

export interface RawInstance {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  owners: Map<string, Owner>;
  links: ManualLink[];
  groupNames: Map<string, string>;
  now: number;
  live?: boolean;
  /** Hand-authored SOPs so the agent sees the same processes as the /map board. */
  sops?: AuthoredSop[];
  /** Semantic-similar pairs (from embeddings), computed async upstream. */
  similar?: SimilarPair[];
  /** Behaviour-change events (from snapshot diffing). Optional: when omitted the
   *  brief still surfaces incident/ownership/governance/hygiene/shared items. */
  changes?: Map<string, ChangeEvent[]>;
}

/** Pure composition — no I/O, so it is unit-testable against fixtures. */
export function composeAgentContext(input: RawInstance): AgentContext {
  const { workflows, executions, owners, links, groupNames, now, live = false, sops, similar } = input;
  const items = composeRegistry({ workflows, executions, owners, now });
  const graph = composeGraph({ workflows, executions, owners, links, groupNames, now, sops, similar });

  // Reconstruct the brief's attention items from data already in hand — no extra
  // I/O so every Slack turn stays fast. Blast notes come from the graph we just
  // built; shared-credential groups from the raw workflows.
  const blastById = new Map(
    graph.nodes.filter((n) => n.kind === "workflow").map((n) => [n.id, blastRadius(n.id, graph)]),
  );
  const attention = buildBrief({
    items,
    changes: input.changes ?? new Map(),
    sharedCredentials: credentialGroups(workflows),
    blastById,
  });

  return { items, graph, executions, attention, live, now };
}
