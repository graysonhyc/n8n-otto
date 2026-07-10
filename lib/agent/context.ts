import type { N8nWorkflow, N8nExecution } from "@/lib/n8n/types";
import type { Owner, ManualLink } from "@/lib/backoffice/types";
import { composeRegistry, type RegistryItem } from "@/lib/derive/registry";
import { composeGraph, type WorkflowGraph } from "@/lib/derive/graph";

// The single snapshot every agent tool reads from during one turn: the
// business-readable registry plus the dependency graph (which carries the
// edges + process groups that blast-radius needs). Composed once so tools
// never re-derive or re-fetch.
export interface AgentContext {
  items: RegistryItem[];
  graph: WorkflowGraph;
  live: boolean;
}

export interface RawInstance {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  owners: Map<string, Owner>;
  links: ManualLink[];
  groupNames: Map<string, string>;
  now: number;
  live?: boolean;
}

/** Pure composition — no I/O, so it is unit-testable against fixtures. */
export function composeAgentContext(input: RawInstance): AgentContext {
  const { workflows, executions, owners, links, groupNames, now, live = false } = input;
  const items = composeRegistry({ workflows, executions, owners, now });
  const graph = composeGraph({ workflows, executions, owners, links, groupNames, now });
  return { items, graph, live };
}
