import type { N8nExecution, N8nWorkflow } from "@/lib/n8n/types";
import type { ManualLink, Owner } from "@/lib/backoffice/types";
import { agentToolEdges, sharedCredentialEdges, workflowCallEdges } from "./edges";
import { composeRegistryItem, type RegistryItem } from "./registry";

export interface Ref {
  id: string;
  name: string;
}

export interface SharedCredential {
  credentialName: string;
  with: Ref[];
}

export interface ManualRel extends Ref {
  linkId: string;
  relation: ManualLink["relation"];
  direction: "outgoing" | "incoming";
}

export interface DetailModel {
  item: RegistryItem;
  relationships: {
    callsOut: Ref[];
    calledBy: Ref[];
    sharedCredentials: SharedCredential[];
    agentTools: string[];
    manual: ManualRel[];
  };
  ifBreaks: Ref[];
}

function nameMap(workflows: N8nWorkflow[]): Map<string, string> {
  return new Map(workflows.map((w) => [w.id, w.name]));
}

export function composeDetail(input: {
  workflow: N8nWorkflow;
  allWorkflows: N8nWorkflow[];
  executions: N8nExecution[];
  owner: Owner | null;
  manualLinks: ManualLink[];
  now: number;
}): DetailModel {
  const { workflow, allWorkflows, executions, owner, manualLinks, now } = input;
  const names = nameMap(allWorkflows);
  const item = composeRegistryItem(workflow, executions, owner, now);

  const callsOut: Ref[] = workflowCallEdges(workflow).map((e) => ({
    id: e.to,
    name: names.get(e.to) ?? e.to,
  }));

  const calledBy: Ref[] = allWorkflows
    .filter((w) => w.id !== workflow.id)
    .filter((w) => workflowCallEdges(w).some((e) => e.to === workflow.id))
    .map((w) => ({ id: w.id, name: w.name }));

  const sharedByCred = new Map<string, SharedCredential>();
  for (const e of sharedCredentialEdges(allWorkflows)) {
    if (e.from !== workflow.id && e.to !== workflow.id) continue;
    const otherId = e.from === workflow.id ? e.to : e.from;
    const entry = sharedByCred.get(e.credentialName) ?? {
      credentialName: e.credentialName,
      with: [],
    };
    if (!entry.with.some((r) => r.id === otherId)) {
      entry.with.push({ id: otherId, name: names.get(otherId) ?? otherId });
    }
    sharedByCred.set(e.credentialName, entry);
  }

  const agentTools = agentToolEdges(workflow).map((e) => e.to);

  const manual: ManualRel[] = manualLinks.map((l) => {
    const outgoing = l.fromId === workflow.id;
    const otherId = outgoing ? l.toId : l.fromId;
    return {
      id: otherId,
      name: names.get(otherId) ?? otherId,
      linkId: l.id,
      relation: l.relation,
      direction: outgoing ? "outgoing" : "incoming",
    };
  });

  // Blast radius (local): direct downstream = workflows this one calls + those sharing its work.
  const ifBreaks = [...callsOut, ...calledBy].filter(
    (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i,
  );

  return {
    item,
    relationships: { callsOut, calledBy, sharedCredentials: [...sharedByCred.values()], agentTools, manual },
    ifBreaks,
  };
}
