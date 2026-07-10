import type { ClusterBasis } from "./suggestions";

/** The deterministic profile of one workflow in a cluster. */
export interface WorkflowProfile {
  id: string;
  name: string;
  trigger: string; // "schedule" | "webhook" | "manual" | ...
  systems: string[]; // e.g. ["Google Sheets", "YouTube"]
}

export interface ClusterFacts {
  members: WorkflowProfile[];
  basis: ClusterBasis;
  targetSopName?: string | null; // set for add-to-sop
}

function profileLine(m: WorkflowProfile): string {
  const bits = [m.trigger, ...(m.systems.length ? [m.systems.join(", ")] : [])].filter(Boolean);
  return bits.length ? `${m.name} (${bits.join(" · ")})` : m.name;
}

function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** How the cluster is connected, as a short human phrase. */
function connection(basis: ClusterBasis): string {
  if (basis.viaCalls) return "one calls another via Execute Workflow";
  if (basis.sharedResource) return `both use the same ${basis.sharedResource.system} — "${basis.sharedResource.name}"`;
  return "share a data source";
}

/** Deterministic ground-truth footer — always exact, shown under the rationale. */
export function factLine(f: ClusterFacts): string {
  const names = f.members.map((m) => m.name);
  if (f.basis.viaCalls) return `Linked by Execute Workflow call · ${names.join(", ")}`;
  if (f.basis.sharedResource) {
    return `Shared ${f.basis.sharedResource.system}: ${f.basis.sharedResource.name} · ${names.join(", ")}`;
  }
  return `Related · ${names.join(", ")}`;
}

/** Deterministic fallback rationale, used when no LLM is configured. */
export function synopsis(f: ClusterFacts): string {
  const lines = f.members.map(profileLine);
  const head = `${andList(lines)} ${connection(f.basis)}.`;
  const tail = f.targetSopName
    ? ` They fit the existing "${f.targetSopName}" process.`
    : " Grouping them as one SOP gives a single owner for the whole flow.";
  return head + tail;
}

/** Compact fact sheet handed to the LLM. Never includes anything not derived. */
export function promptFacts(f: ClusterFacts): string {
  const members = f.members
    .map((m) => `- ${m.name}: trigger=${m.trigger}; systems=${m.systems.join(", ") || "none detected"}`)
    .join("\n");
  const link = f.basis.viaCalls
    ? "One workflow invokes another via an Execute Workflow node (a call chain)."
    : f.basis.sharedResource
      ? `They all read/write the same ${f.basis.sharedResource.system} resource: "${f.basis.sharedResource.name}".`
      : "They touch a shared data source.";
  const target = f.targetSopName ? `\nThey are candidates to add to the existing SOP "${f.targetSopName}".` : "";
  return `Workflows:\n${members}\n\nHow they connect: ${link}${target}`;
}
