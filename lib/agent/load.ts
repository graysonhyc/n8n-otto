import "server-only";
import { loadInstance } from "@/lib/data/source";
import { getAllOwners, getAllLinks, listSops } from "@/lib/backoffice/store";
import { computeSimilarPairs } from "@/lib/data/duplicates";
import { composeAgentContext, type AgentContext } from "./context";

// I/O wrapper: pull the instance + stored owners/links/SOPs once, then hand off
// to the pure composer. Called at the start of each agent turn. Hand-authored
// SOPs (the /map Process-groups board) are loaded here so the agent answers
// about the same processes the team sees in the UI.
export async function buildAgentContext(): Promise<AgentContext> {
  const [{ workflows, executions, live }, owners, links, sopRows] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    getAllLinks(),
    listSops(),
  ]);
  const groupNames = new Map<string, string>();
  const sops = sopRows.map((s) => ({
    id: s.id,
    name: s.name,
    workflowIds: s.members.map((m) => m.workflowId),
  }));
  // Semantic-similar pairs (cached embeddings) so Otto can answer "do we have
  // duplicate agents?" and blast radius can flag near-duplicates as advisory.
  const similar = await computeSimilarPairs(workflows);
  return composeAgentContext({ workflows, executions, owners, links, groupNames, now: Date.now(), live, sops, similar });
}
