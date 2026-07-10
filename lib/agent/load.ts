import "server-only";
import { loadInstance } from "@/lib/data/source";
import { getAllOwners, getAllLinks, getProcessGroupNames } from "@/lib/backoffice/store";
import { composeAgentContext, type AgentContext } from "./context";

// I/O wrapper: pull the instance + stored owners/links/group names once, then
// hand off to the pure composer. Called at the start of each agent turn.
export async function buildAgentContext(): Promise<AgentContext> {
  const [{ workflows, executions, live }, owners, links, groupNames] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    getAllLinks(),
    getProcessGroupNames(),
  ]);
  return composeAgentContext({ workflows, executions, owners, links, groupNames, now: Date.now(), live });
}
