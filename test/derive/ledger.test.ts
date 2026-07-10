import { describe, it, expect } from "vitest";
import { estateLedger } from "@/lib/derive/ledger";
import type { RegistryItem } from "@/lib/derive/registry";
import type { N8nExecution } from "@/lib/n8n/types";

const now = Date.parse("2026-07-10T00:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

function item(over: Partial<RegistryItem>): RegistryItem {
  return {
    id: "x",
    name: "X",
    type: "deterministic",
    active: true,
    criticality: "Medium",
    systems: [],
    toolNames: [],
    tags: [],
    owner: null,
    health: { recentFailures: 0, lastStatus: "success" },
    risk: { level: "low", label: "", reasons: [] },
    lastChange: null,
    timeSavedPerExecution: null,
    ...over,
  } as unknown as RegistryItem;
}

describe("estateLedger", () => {
  const items = [
    item({ id: "roi", name: "Saver", type: "ai-agent-tools", timeSavedPerExecution: 20 }),
    item({ id: "idle", name: "Idle Bot", active: true }),
    item({ id: "fail", name: "Broken", active: true, health: { recentFailures: 5, lastStatus: "error" } }),
    item({ id: "crit", name: "Crit", active: true, criticality: "High", owner: null }),
  ];
  const executions: N8nExecution[] = [
    // 3 successful runs of "roi" in-window → 3 * 20 = 60 min saved
    ...[1, 2, 3].map((n) => ({ id: `r${n}`, workflowId: "roi", finished: true, status: "success", startedAt: daysAgo(n) }) as N8nExecution),
    // an out-of-window run that must NOT count
    { id: "old", workflowId: "roi", finished: true, status: "success", startedAt: daysAgo(90) } as N8nExecution,
  ];

  const ledger = estateLedger(items, executions, now, 30);

  it("sums ROI from successful in-window runs using the per-exec estimate", () => {
    expect(ledger.roi.minutesSaved).toBe(60);
    expect(ledger.roi.top[0]).toMatchObject({ id: "roi", name: "Saver" });
  });

  it("flags idle (active, zero runs in window) workflows as waste", () => {
    expect(ledger.waste.idle.map((w) => w.id)).toContain("idle");
    expect(ledger.waste.idle.map((w) => w.id)).not.toContain("roi");
  });

  it("flags failing workflows", () => {
    expect(ledger.waste.failing.map((w) => w.id)).toContain("fail");
  });

  it("counts unowned + unowned-critical", () => {
    expect(ledger.totals.unowned).toBeGreaterThanOrEqual(1);
    expect(ledger.totals.unownedCritical).toBeGreaterThanOrEqual(1);
  });
});
