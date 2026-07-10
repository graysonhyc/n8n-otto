import "server-only";
import { loadInstance } from "@/lib/data/source";
import { getAllOwners, getAllLinks } from "@/lib/backoffice/store";
import { composeAgentContext, type AgentContext } from "./context";

// I/O wrapper: pull the instance + stored owners/links once, then hand off to the
// pure composer. Called at the start of each agent turn. Auto-cluster naming now
// lives in SOPs, so the blast-map composer runs with unnamed clusters.
export async function buildAgentContext(): Promise<AgentContext> {
  const [{ workflows, executions, live }, owners, links] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    getAllLinks(),
  ]);
  const groupNames = new Map<string, string>();
  return composeAgentContext({ workflows, executions, owners, links, groupNames, now: Date.now(), live });
}
