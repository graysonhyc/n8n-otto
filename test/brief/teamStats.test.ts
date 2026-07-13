import { describe, expect, it } from "vitest";
import { computeTeamStats } from "@/lib/brief/teamStats";
import type { RegistryItem } from "@/lib/derive/registry";
import type { N8nExecution } from "@/lib/n8n/types";

const NOW = Date.parse("2026-07-10T09:00:00+02:00");

// Minimal registry item; override only what a test cares about.
function item(over: Partial<RegistryItem> & { id: string }): RegistryItem {
  return {
    name: over.id,
    type: "deterministic",
    usesAI: false,
    hasAgent: false,
    humanInLoop: false,
    hasToolAccess: false,
    systems: [],
    trigger: "schedule",
    model: null,
    toolNames: [],
    active: true,
    tags: [],
    owner: null,
    suggestedOwner: null,
    suggestedChannel: null,
    criticality: "Medium",
    health: { recentFailures: 0, lastStatus: "success" },
    risk: { level: "low", label: "Healthy", reasons: [] },
    lastChange: null,
    project: null,
    disconnectedNodes: [],
    timeSavedPerExecution: null,
    ...over,
  };
}

// An execution inside yesterday's window (relative to NOW, CEST).
function exec(workflowId: string, status: N8nExecution["status"]): N8nExecution {
  return {
    id: `${workflowId}-${status}-${Math.random()}`,
    workflowId,
    finished: true,
    status,
    startedAt: "2026-07-09T10:00:00.000Z",
    stoppedAt: "2026-07-09T10:00:01.000Z",
  } as N8nExecution;
}

describe("computeTeamStats", () => {
  it("counts active, paused and archived separately", () => {
    const items = [
      item({ id: "a", active: true }),
      item({ id: "b", active: true }),
      item({ id: "c", active: false }),
    ];
    const stats = computeTeamStats({ items, executions: [], archived: 4, now: NOW });
    expect(stats.active).toBe(2);
    expect(stats.paused).toBe(1);
    expect(stats.archived).toBe(4);
  });

  it("counts erroring workflows and incidents from registry health", () => {
    const items = [
      item({ id: "ok", health: { recentFailures: 0, lastStatus: "success" } }),
      item({ id: "flaky", health: { recentFailures: 1, lastStatus: "error" } }),
      item({ id: "broken", health: { recentFailures: 5, lastStatus: "error" } }),
    ];
    const stats = computeTeamStats({ items, executions: [], archived: 0, now: NOW });
    expect(stats.withErrors).toBe(2); // flaky + broken
    expect(stats.incidents).toBe(1); // only broken (≥3)
  });

  it("derives run totals, failure rate and top error source from yesterday", () => {
    const items = [item({ id: "w1", name: "Sync Linked" })];
    const executions = [
      exec("w1", "success"),
      exec("w1", "success"),
      exec("w1", "error"),
      exec("w1", "error"),
    ];
    const stats = computeTeamStats({ items, executions, archived: 0, now: NOW });
    expect(stats.runs).toBe(4);
    expect(stats.failedRuns).toBe(2);
    expect(stats.failureRate).toBe(50);
    expect(stats.topError).toEqual({ name: "Sync Linked", errors: 2 });
  });

  it("surfaces at most three insights, prioritising ROI then busiest", () => {
    const items = [
      item({ id: "w1", name: "Busy", active: true, usesAI: true }),
      item({ id: "w2", active: true, owner: null }), // unowned
    ];
    const executions = [exec("w1", "success"), exec("w1", "success")];
    const stats = computeTeamStats({ items, executions, archived: 0, now: NOW });
    expect(stats.insights.length).toBeLessThanOrEqual(3);
    expect(stats.insights.some((i) => i.includes("saved"))).toBe(true);
    expect(stats.insights.some((i) => i.startsWith("Busiest:"))).toBe(true);
  });

  it("reports no top error source when nothing failed", () => {
    const items = [item({ id: "w1" })];
    const stats = computeTeamStats({ items, executions: [exec("w1", "success")], archived: 0, now: NOW });
    expect(stats.topError).toBeNull();
    expect(stats.failureRate).toBe(0);
  });
});
