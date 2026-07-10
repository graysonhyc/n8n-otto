import type { ChatClient } from "@/lib/agent/run";
import type { DailyBrief } from "./daily";

const SYSTEM = `You are n8n Otto, the n8n Backoffice coworker, writing a team's morning brief in a Slack channel.
Write in Slack mrkdwn (single *asterisks* for bold), warm but concise — a coworker, not a report generator.
Cover, in this order and only when non-empty: yesterday's performance, today's plan (scheduled runs + changes), and 1–3 "explore next" suggestions.
Rules:
- Use ONLY the numbers, workflow names, and facts in DATA. NEVER invent metrics, workflows, owners, or systems.
- If DATA shows no runs, say so plainly and keep it short.
- No preamble, no "here is your brief". Open with the single most useful takeaway.
- End with one short line inviting them to ask you (e.g. "Ask me what breaks if X fails.").`;

// Compact, exact figures only — this is the ground truth the model may use.
function briefData(daily: DailyBrief, channelName: string | null) {
  const y = daily.yesterday;
  return {
    channel: channelName,
    yesterday: {
      date: y.dateLabel,
      runs: y.runs,
      successes: y.successes,
      errors: y.errors,
      errorPct: y.errorPct,
      tasksSolved: y.tasksSolved,
      timeSavedMinutes: y.timeSavedMinutes,
      timeSavedEstimated: y.timeSavedEstimated,
      activeWorkflows: y.activeWorkflows,
      topRunners: y.topRunners.map((s) => ({ name: s.name, runs: s.runs })),
      topErrorSources: y.topErrorSources.map((s) => ({ name: s.name, errors: s.errors })),
    },
    today: {
      scheduled: daily.today.scheduled.map((s) => s.name),
      changes: daily.today.changes.map((c) => ({ name: c.name, detail: c.detail })),
      attentionCount: daily.today.attention.length,
      highCount: daily.today.attention.filter((a) => a.severity === "high").length,
    },
    exploreNext: daily.exploreNext.map((e) => ({ title: e.title, detail: e.detail ?? null })),
  };
}

function deterministicLine(daily: DailyBrief): string {
  const y = daily.yesterday;
  if (y.runs === 0) return `*Yesterday (${y.dateLabel}):* no production runs.`;
  const pct = Math.round((y.successes / y.runs) * 100);
  return `*Yesterday (${y.dateLabel}):* ${y.runs} runs · ${pct}% success · ${y.errors} errors.`;
}

// Turn a scoped DailyBrief into Otto-voice Slack mrkdwn. The client is injected so
// this stays SDK-agnostic and unit-testable; empty model output falls back to a
// deterministic summary so a channel always gets its numbers.
export async function narrateBrief(input: {
  daily: DailyBrief;
  channelName: string | null;
  client: ChatClient;
  model?: string;
}): Promise<string> {
  // `||` (not `??`) so an empty-string env var falls through to the default.
  const model = input.model || process.env.OTTO_MODEL || process.env.OPENAI_MODEL || "gpt-4.1";
  const data = briefData(input.daily, input.channelName);
  const res = await input.client.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `DATA:\n${JSON.stringify(data, null, 2)}` },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : deterministicLine(input.daily);
}
