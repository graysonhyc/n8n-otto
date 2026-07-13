import type { KnownBlock } from "@slack/web-api";
import type { BriefItem, Severity } from "@/lib/brief/build";
import type { DailyBrief } from "@/lib/brief/daily";
import type { SopSuggestion } from "@/lib/derive/suggestions";

const EMOJI: Record<Severity, string> = { high: "🔴", medium: "🟠", low: "🟡" };

function button(text: string, actionId: string, value: string, style?: "primary" | "danger") {
  return {
    type: "button" as const,
    text: { type: "plain_text" as const, text, emoji: true },
    action_id: actionId,
    value,
    ...(style ? { style } : {}),
  };
}

// A single Brief item as a Slack message (used for health/change alerts).
export function briefItemBlocks(item: BriefItem, routedNote?: string): KnownBlock[] {
  const value = JSON.stringify({ key: item.key, workflowId: item.workflowId });
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${EMOJI[item.severity]} *${item.title}*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*What*\n${item.whatHappened}` },
        { type: "mrkdwn", text: `*Why it matters*\n${item.whyItMatters}` },
        { type: "mrkdwn", text: `*Owner*\n${item.suggestedOwner}` },
        { type: "mrkdwn", text: `*Recommended*\n${item.recommendedAction}` },
      ],
    },
  ];

  if (routedNote) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: routedNote }],
    });
  }

  const actions = [
    button("Open in n8n", "open_in_n8n", value),
    button("Assign owner", "assign_owner", value),
    button("Create Linear ticket", "create_ticket", value),
    button("Acknowledge", "acknowledge", value, "primary"),
  ];
  if (item.category === "change") {
    actions.splice(1, 0, button("Approve", "approve_change", value, "primary"));
    actions.push(button("Rollback prompt", "rollback_prompt", value, "danger"));
  }
  blocks.push({ type: "actions", elements: actions.slice(0, 5) });
  return blocks;
}

// Ownership confirmation prompt.
export function ownershipCheckBlocks(input: {
  workflowId: string;
  name: string;
  suggestedOwner: string;
  reason: string;
}): KnownBlock[] {
  const value = JSON.stringify({ workflowId: input.workflowId, team: input.suggestedOwner });
  return [
    { type: "section", text: { type: "mrkdwn", text: `🔵 *Ownership check — ${input.name}*` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Suggested owner*\n${input.suggestedOwner}` },
        { type: "mrkdwn", text: `*Reason*\n${input.reason}` },
      ],
    },
    {
      type: "actions",
      elements: [
        button("Confirm owner", "confirm_owner", value, "primary"),
        button("Reassign", "reassign_owner", value),
        button("Not my team", "reject_owner", value, "danger"),
      ],
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Confirmation writes back to the Backoffice registry." }],
    },
  ];
}

// A meaningful default SOP name for a suggestion, so a one-click Create SOP does
// not land a generic "Process (2 workflows)". Prefer the shared resource the
// cluster is built around (e.g. a Google Sheet), else the member workflow names.
function suggestionSopName(s: SopSuggestion, names?: Map<string, string>): string {
  const shared = s.basis.sharedResource;
  if (shared?.name) return `${shared.name} sync`;
  const memberNames = s.memberNames ?? s.memberIds.map((id) => names?.get(id) ?? id);
  if (memberNames.length) return memberNames.slice(0, 2).join(" + ");
  return `Process (${s.memberIds.length} workflows)`;
}

// An SOP suggestion as a Slack card: the team can create the SOP (or add the
// missing workflows to an existing one) or dismiss it, all without leaving Slack.
// `names` maps workflow id → name for a readable member list; ids fall back to
// themselves. `memberIds` is JSON-encoded inside `value` because Slack action
// values are flat strings on the way back through the interactivity handler.
export function suggestionBlocks(s: SopSuggestion, names?: Map<string, string>): KnownBlock[] {
  const autoName = suggestionSopName(s, names);
  // The LLM "why this is an SOP" makes a good SOP description; fall back to the
  // deterministic reason. Capped so it fits inside Slack's action-value budget.
  const description = (s.rationale ?? s.reason).slice(0, 1200);
  const value = JSON.stringify({
    suggestionId: s.id,
    memberIds: JSON.stringify(s.memberIds),
    kind: s.kind,
    targetSopId: s.targetSopId ?? "",
    name: autoName,
    description,
  });
  const memberList = (s.memberNames ?? s.memberIds.map((id) => names?.get(id) ?? id)).join(", ");
  const title =
    s.kind === "add-to-sop"
      ? `🧩 *Add to ${s.targetSopName}?*`
      : "🧩 *These workflows look linked — group them?*";
  const body = s.rationale ?? s.reason;
  const footer = s.factLine ?? `Workflows: ${memberList}`;

  const accept =
    s.kind === "add-to-sop"
      ? button(`Add to ${s.targetSopName}`, "add_to_sop_suggestion", value, "primary")
      : button("Create group", "create_sop_from_suggestion", value, "primary");

  return [
    { type: "section", text: { type: "mrkdwn", text: `${title}\n${body}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: footer }] },
    {
      type: "actions",
      elements: [accept, button("Dismiss", "dismiss_suggestion", value, "danger")],
    },
  ];
}

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// Deterministic ground-truth footer posted under Otto's prose so the exact
// numbers are always verifiable even if the narrative drifts.
export function briefFooterBlock(daily: DailyBrief): KnownBlock {
  const y = daily.yesterday;
  const successPct = y.runs ? Math.round((y.successes / y.runs) * 100) : 100;
  const savedNote = y.timeSavedEstimated ? " (est)" : "";
  const line =
    y.runs === 0
      ? `No production runs yesterday (${y.dateLabel})`
      : `${y.dateLabel}: ${y.runs} runs · ${successPct}% success · ${y.errors} errors · ~${fmtMinutes(
          y.timeSavedMinutes,
        )} saved${savedNote} · ${y.activeWorkflows} active`;
  return { type: "context", elements: [{ type: "mrkdwn", text: `📊 ${line}` }] };
}
