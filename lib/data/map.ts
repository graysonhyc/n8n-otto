import "server-only";
import { loadInstance } from "./source";
import { getAllOwners, getAllLinks, getProcessGroupNames } from "@/lib/backoffice/store";
import { composeGraph, type WorkflowGraph } from "@/lib/derive/graph";

export interface MapView {
  graph: WorkflowGraph;
  live: boolean;
}

export async function loadMap(): Promise<MapView> {
  const [{ workflows, executions, live }, owners, links, groupNames] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    getAllLinks(),
    getProcessGroupNames(),
  ]);
  const graph = composeGraph({
    workflows,
    executions,
    owners,
    links,
    groupNames,
    now: Date.now(),
  });
  return { graph, live };
}
