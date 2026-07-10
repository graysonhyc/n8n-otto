import type { N8nExecution, WorkflowType } from "@/lib/n8n/types";
import type { RegistryItem } from "@/lib/derive/registry";
import type { ChangeEvent } from "@/lib/diff/snapshot";
import type { BriefItem } from "./build";
import type { SharedCredentialInfo } from "./build";

// ---- Yesterday recap -------------------------------------------------------

export interface WorkflowStat {
  id: string;
  name: string;
  runs: number;
  successes: number;
  errors: number;
  totalDurationMs: number;
  timeSavedMinutes: number;
}

export interface YesterdaySummary {
  dateLabel: string;
  runs: number;
  successes: number;
  errors: number;
  errorPct: number; // 0–100, rounded to 1dp
  tasksSolved: number;
  avgDurationMs: number;
  totalDurationMs: number;
  timeSavedMinutes: number;
  timeSavedEstimated: boolean; // true when any workflow fell back to a type default
  activeWorkflows: number; // distinct workflows that ran
  topRunners: WorkflowStat[];
  topErrorSources: WorkflowStat[];
}

const DAY_MS = 86_400_000;
const CEST_OFFSET_MIN = 120; // brief runs at 09:00 CEST

// n8n Insights only credits time saved when the owner has set a per-workflow
// value. We fall back to these type defaults so an unconfigured demo instance
// still shows a plausible (clearly-estimated) number.
export const TYPE_DEFAULT_MINUTES: Record<WorkflowType, number> = {
  "ai-agent-tools": 15,
  "ai-assisted": 8,
  deterministic: 3,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// [start, end) UTC millis of the calendar day before `now`, in the given offset.
function yesterdayWindow(now: number, offsetMin: number) {
  const offMs = offsetMin * 60_000;
  const localMidnightToday = Math.floor((now + offMs) / DAY_MS) * DAY_MS;
  const start = localMidnightToday - DAY_MS - offMs;
  return { start, end: localMidnightToday - offMs, label: dayLabel(start + offMs) };
}

function dayLabel(shiftedMs: number): string {
  const d = new Date(shiftedMs);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function durationMs(e: N8nExecution): number {
  if (!e.stoppedAt) return 0;
  return Math.max(0, Date.parse(e.stoppedAt) - Date.parse(e.startedAt));
}

// Production runs, mirroring Insights: only active, non-manual workflows count.
function isProduction(item: RegistryItem): boolean {
  return item.active && item.trigger !== "manual";
}

export function computeYesterday(
  items: RegistryItem[],
  executions: N8nExecution[],
  now: number,
  offsetMin = CEST_OFFSET_MIN,
): YesterdaySummary {
  const { start, end, label } = yesterdayWindow(now, offsetMin);
  const byId = new Map(items.map((i) => [i.id, i]));
  const stats = new Map<string, WorkflowStat>();
  let estimated = false;

  for (const e of executions) {
    const item = byId.get(e.workflowId);
    if (!item || !isProduction(item)) continue;
    const startedMs = Date.parse(e.startedAt);
    if (startedMs < start || startedMs >= end) continue;

    let s = stats.get(item.id);
    if (!s) {
      s = { id: item.id, name: item.name, runs: 0, successes: 0, errors: 0, totalDurationMs: 0, timeSavedMinutes: 0 };
      stats.set(item.id, s);
    }
    s.runs++;
    s.totalDurationMs += durationMs(e);
    if (e.status === "success") s.successes++;
    else if (e.status === "error" || e.status === "crashed") s.errors++;
  }

  for (const s of stats.values()) {
    const item = byId.get(s.id)!;
    const perRun = item.timeSavedPerExecution ?? TYPE_DEFAULT_MINUTES[item.type];
    if (item.timeSavedPerExecution == null && s.successes > 0) estimated = true;
    s.timeSavedMinutes = s.successes * perRun;
  }

  const all = [...stats.values()];
  const runs = sum(all, (s) => s.runs);
  const errors = sum(all, (s) => s.errors);
  const totalDurationMs = sum(all, (s) => s.totalDurationMs);

  return {
    dateLabel: label,
    runs,
    successes: sum(all, (s) => s.successes),
    errors,
    errorPct: runs ? Math.round((errors / runs) * 1000) / 10 : 0,
    tasksSolved: sum(all, (s) => s.successes),
    avgDurationMs: runs ? Math.round(totalDurationMs / runs) : 0,
    totalDurationMs,
    timeSavedMinutes: sum(all, (s) => s.timeSavedMinutes),
    timeSavedEstimated: estimated,
    activeWorkflows: all.length,
    topRunners: [...all].sort((a, b) => b.runs - a.runs).slice(0, 3),
    topErrorSources: all.filter((s) => s.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 3),
  };
}

// ---- Today look-ahead ------------------------------------------------------

export interface TodayEntry {
  id: string | null;
  name: string;
  detail: string;
}

export interface TodaySummary {
  scheduled: TodayEntry[];
  changes: TodayEntry[];
  attention: BriefItem[];
}

const CHANGE_LABEL: Record<ChangeEvent["kind"], string> = {
  prompt: "prompt changed",
  model: "model changed",
  "tool-access": "tool access changed",
  trigger: "trigger changed",
  active: "activation changed",
  credential: "credential changed",
  structure: "structure changed",
};

export function computeToday(
  items: RegistryItem[],
  changes: Map<string, ChangeEvent[]>,
  attention: BriefItem[],
): TodaySummary {
  const byId = new Map(items.map((i) => [i.id, i]));

  const scheduled: TodayEntry[] = items
    .filter((i) => i.active && i.trigger === "schedule")
    .map((i) => ({
      id: i.id,
      name: i.name,
      detail: i.systems.length ? `scheduled · touches ${i.systems.join(", ")}` : "scheduled run",
    }));

  const changeEntries: TodayEntry[] = [];
  for (const [id, events] of changes) {
    const item = byId.get(id);
    if (!item || events.length === 0) continue;
    changeEntries.push({
      id,
      name: item.name,
      detail: [...new Set(events.map((e) => CHANGE_LABEL[e.kind]))].join(", "),
    });
  }

  return { scheduled, changes: changeEntries, attention };
}

// ---- Explore next ----------------------------------------------------------

export interface ExploreItem {
  title: string;
  detail?: string;
}

const STALE_DAYS = 60;

export function computeExploreNext(
  items: RegistryItem[],
  sharedCredentials: SharedCredentialInfo[],
  now: number,
): ExploreItem[] {
  const out: ExploreItem[] = [];

  // Native ROI tie-in: workflows running in production with no time-saved set.
  const unconfigured = items.filter((i) => isProduction(i) && i.timeSavedPerExecution == null);
  if (unconfigured.length) {
    out.push({
      title: `Set time saved on ${unconfigured.length} workflow(s) to unlock accurate ROI`,
      detail: "The brief is estimating these from workflow type — one owner value each makes the number real.",
    });
  }

  // Agents that could gain a review step.
  for (const i of items.filter((i) => i.type === "ai-agent-tools" && i.active && !i.humanInLoop)) {
    out.push({ title: `Add human review to ${i.name}`, detail: `Agent acts via ${i.toolNames.length} tool(s) with no review step.` });
  }

  // Shared credentials worth consolidating / giving a rotation owner.
  for (const c of sharedCredentials.filter((c) => c.workflowIds.length >= 3)) {
    out.push({ title: `Give ${c.credentialName} a rotation owner`, detail: `Shared by ${c.workflowIds.length} workflows — one expiry breaks them all.` });
  }

  // Stale but still active — retire or reconfirm.
  for (const i of items.filter((i) => isStale(i.lastChange, now) && i.active && i.systems.length > 0)) {
    out.push({ title: `Reconfirm or retire ${i.name}`, detail: "Untouched for 60+ days but still holds production access." });
  }

  // Manual/unknown triggers that could be scheduled.
  for (const i of items.filter((i) => i.active && (i.trigger === "manual" || i.trigger === "unknown"))) {
    out.push({ title: `Consider scheduling ${i.name}`, detail: "Runs manually today — a schedule trigger removes the human step." });
  }

  return out.slice(0, 6);
}

function isStale(lastChange: string | null, now: number): boolean {
  if (!lastChange) return false;
  return (now - Date.parse(lastChange)) / DAY_MS > STALE_DAYS;
}

// ---- Aggregate -------------------------------------------------------------

export interface DailyBrief {
  yesterday: YesterdaySummary;
  today: TodaySummary;
  exploreNext: ExploreItem[];
}

export function computeDailyBrief(input: {
  items: RegistryItem[];
  executions: N8nExecution[];
  changes: Map<string, ChangeEvent[]>;
  attention: BriefItem[];
  sharedCredentials: SharedCredentialInfo[];
  now: number;
  offsetMin?: number;
}): DailyBrief {
  return {
    yesterday: computeYesterday(input.items, input.executions, input.now, input.offsetMin),
    today: computeToday(input.items, input.changes, input.attention),
    exploreNext: computeExploreNext(input.items, input.sharedCredentials, input.now),
  };
}

function sum<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((acc, x) => acc + f(x), 0);
}
