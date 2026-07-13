import type { N8nExecution } from "@/lib/n8n/types";
import type { RegistryItem } from "@/lib/derive/registry";
import { computeYesterday } from "./daily";

// Per-team snapshot for the daily brief. Deterministic (no LLM): the brief now
// reports exact estate numbers per team instead of narrated prose, so these are
// the ground truth a channel sees each morning.
export interface TeamStats {
  dateLabel: string; // the "yesterday" window the run numbers cover
  active: number; // active (running) workflows the team owns
  paused: number; // inactive but not archived
  archived: number; // archived workflows the team owns
  withErrors: number; // active workflows with ≥1 recent failure
  incidents: number; // workflows failing enough to be an incident (≥3)
  runs: number; // production runs yesterday
  failedRuns: number; // failed production runs yesterday
  failureRate: number; // failedRuns / runs, 0–100 (1dp)
  topError: { name: string; errors: number } | null; // worst offender yesterday
  insights: string[]; // up to 3 deterministic "worth knowing" lines
}

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

// A few interesting, exact facts about the team's estate — ranked by how much a
// human skimming would care, capped at three so the brief stays tight. Every
// line uses only counted values (never invented), matching the brief's
// "ground truth" contract.
function buildInsights(input: {
  items: RegistryItem[];
  active: number;
  timeSavedMinutes: number;
  timeSavedEstimated: boolean;
  topRunner: { name: string; runs: number } | null;
}): string[] {
  const { items, active, timeSavedMinutes, timeSavedEstimated, topRunner } = input;
  const out: string[] = [];

  if (timeSavedMinutes > 0) {
    out.push(`~${fmtMinutes(timeSavedMinutes)} of manual work saved yesterday${timeSavedEstimated ? " (est)" : ""}`);
  }
  if (topRunner && topRunner.runs > 0) {
    out.push(`Busiest: ${topRunner.name} (${topRunner.runs} ${plural(topRunner.runs, "run")})`);
  }
  const unowned = items.filter((i) => i.active && !i.owner).length;
  if (unowned > 0) out.push(`${unowned} active ${plural(unowned, "workflow")} still unowned`);

  const ungoverned = items.filter((i) => i.active && i.type === "ai-agent-tools" && !i.humanInLoop).length;
  if (ungoverned > 0) out.push(`${ungoverned} AI ${plural(ungoverned, "agent")} acting with no human review`);

  const ai = items.filter((i) => i.active && i.usesAI).length;
  if (ai > 0 && active > 0) out.push(`${ai}/${active} active workflows use AI`);

  return out.slice(0, 3);
}

// Roll a team's scoped registry items + executions into the brief snapshot.
// `archived` is passed in because archived workflows are filtered out before the
// registry (see lib/n8n/filter.ts), so their count is the only thing threaded
// through. Run figures reuse computeYesterday so the numbers match the estate.
export function computeTeamStats(input: {
  items: RegistryItem[];
  executions: N8nExecution[];
  archived: number;
  now: number;
  offsetMin?: number;
}): TeamStats {
  const { items, executions, archived, now, offsetMin } = input;
  const y = computeYesterday(items, executions, now, offsetMin);

  const active = items.filter((i) => i.active).length;
  const paused = items.filter((i) => !i.active).length;
  const withErrors = items.filter((i) => i.active && i.health.recentFailures > 0).length;
  const incidents = items.filter((i) => i.health.recentFailures >= 3).length;
  const top = y.topErrorSources[0];

  return {
    dateLabel: y.dateLabel,
    active,
    paused,
    archived,
    withErrors,
    incidents,
    runs: y.runs,
    failedRuns: y.errors,
    failureRate: y.errorPct,
    topError: top ? { name: top.name, errors: top.errors } : null,
    insights: buildInsights({
      items,
      active,
      timeSavedMinutes: y.timeSavedMinutes,
      timeSavedEstimated: y.timeSavedEstimated,
      topRunner: y.topRunners[0] ? { name: y.topRunners[0].name, runs: y.topRunners[0].runs } : null,
    }),
  };
}
