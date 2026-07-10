import type { RegistryItem } from "@/lib/derive/registry";
import type { BlastRadius } from "@/lib/derive/blast";
import type { ChangeEvent } from "@/lib/diff/snapshot";

// Pure builder: turn a workflow + its blast radius + recent changes into a
// Linear issue (title + markdown body). No network — the client does the call.
export interface TicketDraft {
  title: string;
  description: string;
}

export interface BuildTicketInput {
  item: RegistryItem;
  blast: BlastRadius;
  changes: ChangeEvent[];
}

function headline(item: RegistryItem): string {
  if (item.health.recentFailures > 0) {
    return `${item.health.recentFailures} recent failure${item.health.recentFailures === 1 ? "" : "s"}`;
  }
  if (item.disconnectedNodes?.length) return "disconnected steps";
  return "needs review";
}

function changeLine(c: ChangeEvent): string {
  switch (c.kind) {
    case "prompt":
      return `- Prompt changed on **${c.node}**`;
    case "model":
      return `- Model: \`${c.old ?? "?"}\` → \`${c.new ?? "?"}\``;
    case "tool-access":
      return `- Tool access: +[${c.added.join(", ")}] −[${c.removed.join(", ")}]`;
    case "trigger":
      return `- Trigger: \`${c.old ?? "?"}\` → \`${c.new ?? "?"}\``;
    case "active":
      return `- ${c.new ? "Activated" : "Deactivated"}`;
    case "credential":
      return `- Credentials: +[${c.added.join(", ")}] −[${c.removed.join(", ")}]`;
    case "structure":
      return "- Workflow structure changed";
  }
}

function blastLine(blast: BlastRadius): string {
  const parts: string[] = [];
  if (blast.downstreamWorkflowIds.length) {
    parts.push(`${blast.downstreamWorkflowIds.length} downstream workflow(s)`);
  }
  if (blast.processGroup) parts.push(`part of **${blast.processGroup.name}**`);
  if (blast.systems.length) parts.push(`touches ${blast.systems.join(", ")}`);
  const teams = blast.affectedOwnerTeams.length ? blast.affectedOwnerTeams.join(", ") : "no other teams";
  const impact = parts.length ? parts.join("; ") : "no known downstream impact";
  return `**Blast radius:** ${impact}. Notify: ${teams}.`;
}

export function buildTicket({ item, blast, changes }: BuildTicketInput): TicketDraft {
  const owner = item.owner?.team ?? "Unassigned";
  const title = `[n8n] ${item.name} — ${headline(item)}`;

  const lines: string[] = [
    `**Workflow:** ${item.name} (\`${item.id}\`)`,
    `**Owner:** ${owner}${item.owner?.slackChannelName ? ` (#${item.owner.slackChannelName})` : ""}`,
    `**Criticality:** ${item.criticality} · **Type:** ${item.type} · **Human review:** ${item.humanInLoop ? "yes" : "no"}`,
    `**Health:** ${item.health.recentFailures} recent failure(s), last status \`${item.health.lastStatus}\`.`,
    "",
    blastLine(blast),
  ];

  if (changes.length) {
    lines.push("", "**Recent changes:**", ...changes.map(changeLine));
  }

  lines.push(
    "",
    "**Suggested next step:** verify the failing connection/step in n8n, then replay affected executions. If behavior changed, confirm the change was intended before continued production use.",
    "",
    `_Filed by Otto · workflow detail: /workflow/${item.id}_`,
  );

  return { title, description: lines.join("\n") };
}
