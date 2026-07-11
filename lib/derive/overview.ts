import type { RegistryItem } from "./registry";
import type { N8nExecution } from "@/lib/n8n/types";

// Aggregates for the Overview dashboard. Everything here is derived from real
// registry + execution data — no synthetic trends. If a dimension is empty
// (e.g. no executions yet) it degrades to zeros and the UI renders gracefully.

export type Seg = { label: string; value: number; color: string };

export interface Overview {
  total: number;
  needsAttention: number;
  unowned: number;
  aiAgents: number;
  coveragePct: number;
  atRisk: number;
  execTrend: number[]; // executions per day, oldest → newest
  failTrend: number[];
  execTotal: number;
  failRate: number; // 0..100
  health: Seg[]; // healthy / watch / at-risk
  byTeam: { label: string; value: number; color?: string }[];
  bySystem: { label: string; value: number }[];
  byType: Seg[];
}

const RISK_COLORS = {
  low: "var(--color-ok)",
  medium: "var(--color-warn)",
  high: "var(--color-danger)",
} as const;

function teamOf(i: RegistryItem): string {
  return i.owner?.team ?? i.suggestedOwner?.team ?? "Unassigned";
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function buildOverview(input: {
  items: RegistryItem[];
  executions: N8nExecution[];
  briefCount: number;
  now: number;
  days?: number;
}): Overview {
  const { items, executions, briefCount, now, days = 14 } = input;
  const total = items.length;

  const owned = items.filter((i) => i.owner).length;
  const unowned = total - owned;
  const aiAgents = items.filter((i) => i.hasAgent).length;

  const risk = { low: 0, medium: 0, high: 0 };
  for (const i of items) risk[i.risk.level]++;

  // executions bucketed per day over the trailing window
  const buckets: string[] = [];
  for (let d = days - 1; d >= 0; d--) {
    buckets.push(dayKey(new Date(now - d * 86_400_000).toISOString()));
  }
  const idx = new Map(buckets.map((k, n) => [k, n]));
  const execTrend = new Array(days).fill(0);
  const failTrend = new Array(days).fill(0);
  let execTotal = 0;
  let failTotal = 0;
  for (const e of executions) {
    execTotal++;
    const failed = e.status === "error" || e.status === "crashed";
    if (failed) failTotal++;
    const n = idx.get(dayKey(e.startedAt));
    if (n !== undefined) {
      execTrend[n]++;
      if (failed) failTrend[n]++;
    }
  }

  // teams — top 6 by workflow count, Unassigned always last if present
  const teamCounts = new Map<string, number>();
  for (const i of items) teamCounts.set(teamOf(i), (teamCounts.get(teamOf(i)) ?? 0) + 1);
  const byTeam = [...teamCounts.entries()]
    .map(([label, value]) => ({
      label,
      value,
      color: label === "Unassigned" ? "var(--color-faint)" : "var(--color-accent)",
    }))
    .sort((a, b) =>
      a.label === "Unassigned" ? 1 : b.label === "Unassigned" ? -1 : b.value - a.value,
    )
    .slice(0, 6);

  // integrations — top 6 systems by usage
  const sysCounts = new Map<string, number>();
  for (const i of items) for (const s of i.systems) sysCounts.set(s, (sysCounts.get(s) ?? 0) + 1);
  const bySystem = [...sysCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // type mix
  const typeCounts = new Map<string, number>();
  for (const i of items) typeCounts.set(i.type, (typeCounts.get(i.type) ?? 0) + 1);
  const TYPE_COLORS = ["var(--color-accent)", "var(--color-ai)", "var(--color-info)", "var(--color-faint)"];
  const byType: Seg[] = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], n) => ({ label, value, color: TYPE_COLORS[n % TYPE_COLORS.length] }));

  return {
    total,
    needsAttention: briefCount,
    unowned,
    aiAgents,
    coveragePct: total ? Math.round((owned / total) * 100) : 0,
    atRisk: risk.high,
    execTrend,
    failTrend,
    execTotal,
    failRate: execTotal ? Math.round((failTotal / execTotal) * 100) : 0,
    health: [
      { label: "Healthy", value: risk.low, color: RISK_COLORS.low },
      { label: "Watch", value: risk.medium, color: RISK_COLORS.medium },
      { label: "At risk", value: risk.high, color: RISK_COLORS.high },
    ],
    byTeam,
    bySystem,
    byType,
  };
}
