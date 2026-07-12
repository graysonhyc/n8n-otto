import type { ChatClient } from "@/lib/agent/run";
import type { DailyBrief } from "./daily";

const SYSTEM = `You are n8n Otto, the n8n Backoffice coworker, writing a team's morning brief in a Slack channel.
Slack mrkdwn (single *asterisks* for bold). Be tight — a sharp coworker skimming the estate, not a report.
Hard limit: 3 short sections, one line each, using this exact shape (skip a section only if its DATA is empty):
• *Yesterday* — runs · success% · errors, and name the top runner or error source.
• *Today* — how many scheduled runs, name 1–2; note change count if any.
• *Worth a look* — the single highest-value item from exploreNext.
Rules:
- Use ONLY the numbers, workflow names, and facts in DATA. NEVER invent metrics, workflows, owners, or systems.
- No preamble, no "here is your brief", no restating every workflow. Lead with the number that matters.
- Total under ~60 words. End with one short "Ask me …" line.`;

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
