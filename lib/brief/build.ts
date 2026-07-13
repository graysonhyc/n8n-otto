import type { RegistryItem } from "@/lib/derive/registry";
import type { ChangeEvent } from "@/lib/diff/snapshot";
import type { BlastRadius } from "@/lib/derive/blast";

export type Severity = "high" | "medium" | "low";

export interface BriefItem {
  key: string;
  severity: Severity;
  category: "change" | "ownership" | "shared-resource" | "governance" | "hygiene" | "incident";
  title: string;
  whatHappened: string;
  whyItMatters: string;
  suggestedOwner: string;
  recommendedAction: string;
  workflowId: string | null;
  actions: string[];
}

export interface SharedCredentialInfo {
  credentialId: string;
  credentialName: string;
  workflowIds: string[];
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const DECISION_RE = /\b(decide|decision|approve|reject|recommend|authorap?|refund|deny)\b/i;
const SUMMARISE_RE = /\b(summari[sz]e|summary|inform|retriev)\b/i;

function truncate(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function withBlast(base: string, note: string | null): string {
  return note ? `${base} ${note}` : base;
}

function promptItem(
  item: RegistryItem,
  change: Extract<ChangeEvent, { kind: "prompt" }>,
  blastNote: string | null = null,
): BriefItem {
  const becameDecision = DECISION_RE.test(change.new) && SUMMARISE_RE.test(change.old);
  const severity: Severity = becameDecision || item.hasToolAccess ? "high" : "medium";
  return {
    key: `change:${item.id}:prompt`,
    severity,
    category: "change",
    title: `${item.name} changed behaviour`,
    whatHappened: `Prompt changed from “${truncate(change.old)}” to “${truncate(change.new)}”.`,
    whyItMatters: withBlast(
      becameDecision
        ? "Moved from information retrieval to customer-impacting decision support."
        : "Behaviour changed; review before continued production use.",
      blastNote,
    ),
    suggestedOwner: item.owner?.team ?? "Unassigned",
    recommendedAction: "Request approval before production use.",
    workflowId: item.id,
    actions: ["Open in n8n", "Request approval", "Rollback prompt", "Create Linear ticket"],
  };
}

function incidentItem(item: RegistryItem, blastNote: string | null = null): BriefItem | null {
  if (item.health.recentFailures < 3) return null;
  return {
    key: `incident:${item.id}:failures`,
    severity: "high",
    category: "incident",
    title: `${item.name} failed ${item.health.recentFailures} times recently`,
    whatHappened: `${item.health.recentFailures} failed executions${
      item.systems.length ? ` — may affect ${item.systems.join(", ")}` : ""
    }.`,
    whyItMatters: withBlast("Downstream steps and dependent workflows may be blocked.", blastNote),
    suggestedOwner: item.owner?.team ?? item.project ?? "Unassigned",
    recommendedAction: "Check the connection, then replay failed executions.",
    workflowId: item.id,
    actions: ["Open in n8n", "Assign owner", "Create Linear ticket"],
  };
}

function danglingItem(item: RegistryItem): BriefItem | null {
  if (item.disconnectedNodes.length === 0) return null;
  const shown = item.disconnectedNodes.slice(0, 3).join(", ");
  const more = item.disconnectedNodes.length - 3;
  return {
    key: `structure:${item.id}:dangling`,
    severity: item.active ? "high" : "medium",
    category: "hygiene",
    title: `${item.name} has disconnected steps`,
    whatHappened: `${item.disconnectedNodes.length} node(s) are unreachable from the trigger: ${shown}${
      more > 0 ? ` +${more} more` : ""
    }.`,
    whyItMatters: "These steps will silently never run — the workflow may look healthy while skipping work.",
    suggestedOwner: item.owner?.team ?? item.project ?? "Unassigned",
    recommendedAction: "Reconnect or remove the dangling nodes in n8n.",
    workflowId: item.id,
    actions: ["Open in n8n", "Assign owner"],
  };
}

function ownershipItem(item: RegistryItem): BriefItem | null {
  if (item.owner) return null;
  if (!item.active) return null;
  const severity: Severity = item.criticality === "High" ? "high" : "medium";
  return {
    key: `ownership:${item.id}:no-owner`,
    severity,
    category: "ownership",
    title: `${item.name} has no owner`,
    whatHappened: `${item.criticality}-criticality workflow${
      item.systems.length ? ` touching ${item.systems.join(", ")}` : ""
    } has no confirmed owner.`,
    whyItMatters: "Nobody is accountable if it breaks, and alerts cannot be routed.",
    suggestedOwner: item.project ?? "Unassigned",
    recommendedAction: "Assign an owner and Slack channel.",
    workflowId: item.id,
    actions: ["Assign owner", "Open in n8n"],
  };
}

function governanceItem(item: RegistryItem): BriefItem | null {
  if (item.type !== "ai-agent-tools" || item.humanInLoop || !item.active) return null;
  return {
    key: `governance:${item.id}:no-review`,
    severity: item.criticality === "High" ? "high" : "medium",
    category: "governance",
    title: `${item.name} is an AI agent with tool access and no human review`,
    whatHappened: `Agent can act via ${item.toolNames.length} tool(s) with no human-in-the-loop step.`,
    whyItMatters: "An unreviewed agent can take real actions on connected systems.",
    suggestedOwner: item.owner?.team ?? item.project ?? "Unassigned",
    recommendedAction: "Add a review step or require approval for tool actions.",
    workflowId: item.id,
    actions: ["Open in n8n", "Add review step"],
  };
}

function sharedCredentialItem(
  info: SharedCredentialInfo,
  names: Map<string, string>,
): BriefItem | null {
  if (info.workflowIds.length < 3) return null;
  return {
    key: `shared:${info.credentialId}`,
    severity: "medium",
    category: "shared-resource",
    title: `${info.credentialName} shared by ${info.workflowIds.length} workflows`,
    whatHappened: `Used by ${info.workflowIds
      .map((id) => names.get(id) ?? id)
      .join(", ")}.`,
    whyItMatters: "Expiry or rotation could break multiple workflows at once.",
    suggestedOwner: "Unassigned",
    recommendedAction: "Confirm a rotation owner for this credential.",
    workflowId: null,
    actions: ["Open credential"],
  };
}

// One-line "who else is affected" note from a workflow's blast radius, or null
// when there is no known downstream impact (nothing worth adding to the item).
function blastNoteFor(blast: BlastRadius | undefined, names: Map<string, string>): string | null {
  if (!blast) return null;
  const parts: string[] = [];
  if (blast.downstreamWorkflowIds.length) {
    const shown = blast.downstreamWorkflowIds.slice(0, 2).map((id) => names.get(id) ?? id).join(", ");
    const more = blast.downstreamWorkflowIds.length - 2;
    parts.push(`Blocks ${shown}${more > 0 ? ` +${more} more` : ""}`);
  }
  if (blast.processGroup) parts.push(`part of ${blast.processGroup.name}`);
  if (!parts.length) return null;
  const teams = blast.affectedOwnerTeams.length ? ` Notify: ${blast.affectedOwnerTeams.join(", ")}.` : "";
  return `Blast radius: ${parts.join("; ")}.${teams}`;
}

export function buildBrief(input: {
  items: RegistryItem[];
  changes: Map<string, ChangeEvent[]>;
  sharedCredentials: SharedCredentialInfo[];
  blastById?: Map<string, BlastRadius>;
}): BriefItem[] {
  const names = new Map(input.items.map((i) => [i.id, i.name]));
  const out: BriefItem[] = [];

  for (const item of input.items) {
    const note = blastNoteFor(input.blastById?.get(item.id), names);
    for (const change of input.changes.get(item.id) ?? []) {
      if (change.kind === "prompt") out.push(promptItem(item, change, note));
    }
    const dangling = danglingItem(item);
    if (dangling) out.push(dangling);
    const incident = incidentItem(item, note);
    if (incident) out.push(incident);
    const own = ownershipItem(item);
    if (own) out.push(own);
    const gov = governanceItem(item);
    if (gov) out.push(gov);
  }

  for (const info of input.sharedCredentials) {
    const shared = sharedCredentialItem(info, names);
    if (shared) out.push(shared);
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
