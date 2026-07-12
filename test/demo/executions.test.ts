import { describe, it, expect } from "vitest";
import { demoExecutionOverlay } from "@/lib/demo/executions";
import type { N8nWorkflow } from "@/lib/n8n/types";

const NOW = Date.parse("2026-07-12T09:00:00Z");

function wf(id: string, name: string): N8nWorkflow {
  return { id, name, active: true, nodes: [], connections: {} } as unknown as N8nWorkflow;
}

const workflows = [
  wf("wY", "Sync Youtube Content Database"),
  wf("wL", "Sync Linked Content Database"),
  wf("wH", "Health Score Sync"),
];

describe("demoExecutionOverlay", () => {
  const overlay = demoExecutionOverlay(workflows, NOW);

  it("only emits executions for workflows present in the estate", () => {
    const ids = new Set(overlay.map((e) => e.workflowId));
    expect(ids).toEqual(new Set(["wY", "wL", "wH"]));
  });

  it("gives the failing workflow ≥3 recent errors (enough to raise an incident)", () => {
    const errs = overlay.filter((e) => e.workflowId === "wL" && e.status === "error");
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the failing workflow's most recent execution an error (lastStatus)", () => {
    const mine = overlay
      .filter((e) => e.workflowId === "wL")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    expect(mine[0].status).toBe("error");
  });

  it("gives healthy workflows only successes", () => {
    const yt = overlay.filter((e) => e.workflowId === "wY");
    expect(yt.length).toBeGreaterThan(0);
    expect(yt.every((e) => e.status === "success")).toBe(true);
  });

  it("puts runs in yesterday's window (so the recap is non-empty)", () => {
    const yStart = NOW - 2 * 86_400_000;
    const yEnd = NOW;
    const inWindow = overlay.filter((e) => {
      const t = Date.parse(e.startedAt);
      return t >= yStart && t < yEnd;
    });
    expect(inWindow.length).toBeGreaterThan(0);
  });
});
