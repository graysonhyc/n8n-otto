import type { KnownBlock } from "@slack/web-api";
import type { BriefItem, Severity } from "@/lib/brief/build";
import type { DailyBrief, WorkflowStat } from "@/lib/brief/daily";

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

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s % 1 === 0 ? s : s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function statLine(s: WorkflowStat): string {
  return `${s.name} ${s.runs}`;
}

function section(text: string): KnownBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}

const divider: KnownBlock = { type: "divider" };

// The daily team brief: yesterday's recap, today's look-ahead, and what to
// explore next. Posted once each morning to the master channel; the individual
// attention items are still routed to owner channels separately.
export function dailyBriefBlocks(daily: DailyBrief): KnownBlock[] {
  const { yesterday: y, today, exploreNext } = daily;
  const successPct = y.runs ? Math.round((y.successes / y.runs) * 100) : 100;

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "📋 n8n Backoffice — Daily Brief", emoji: true },
    },
  ];

  // --- Yesterday --------------------------------------------------------
  if (y.runs === 0) {
    blocks.push(section(`*📊 Yesterday (${y.dateLabel})*\nNo production runs.`));
  } else {
    const savedNote = y.timeSavedEstimated ? " _(est)_" : "";
    const recap = [
      `*📊 Yesterday (${y.dateLabel})*`,
      `*${y.runs}* runs · *${successPct}%* success · *${y.errors}* errors (${y.errorPct}%)`,
      `*${y.tasksSolved}* tasks solved · *~${fmtMinutes(y.timeSavedMinutes)}* saved${savedNote} · avg ${fmtDuration(y.avgDurationMs)}/run · ${y.activeWorkflows} active`,
    ];
    if (y.topRunners.length) recap.push(`Top: ${y.topRunners.map(statLine).join(" · ")}`);
    if (y.topErrorSources.length) {
      recap.push(`⚠️ Errors: ${y.topErrorSources.map((s) => `${s.name} (${s.errors})`).join(" · ")}`);
    }
    blocks.push(section(recap.join("\n")));
  }

  // --- Today ------------------------------------------------------------
  blocks.push(divider);
  const todayLines = ["*📅 Today*"];
  todayLines.push(
    today.scheduled.length
      ? `*Scheduled:* ${today.scheduled.map((s) => s.name).join(" · ")}`
      : "*Scheduled:* none",
  );
  todayLines.push(
    today.changes.length
      ? `*Changes:* ${today.changes.map((c) => `${c.name} (${c.detail})`).join(" · ")}`
      : "*Changes:* none detected",
  );
  const high = today.attention.filter((a) => a.severity === "high").length;
  todayLines.push(
    today.attention.length
      ? `*Needs attention:* ${today.attention.length} item(s), ${high} high — routed to owner channels below`
      : "*Needs attention:* all clear",
  );
  blocks.push(section(todayLines.join("\n")));

  // --- Explore next -----------------------------------------------------
  if (exploreNext.length) {
    blocks.push(divider);
    const lines = ["*🔭 Explore next*", ...exploreNext.map((e) => `• *${e.title}*${e.detail ? `\n   ${e.detail}` : ""}`)];
    blocks.push(section(lines.join("\n")));
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Posted daily at 09:00 CEST · attention items routed per owning team" }],
  });
  return blocks;
}
