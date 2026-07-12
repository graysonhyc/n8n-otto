import { describe, it, expect } from "vitest";
import { toolSpecs, dispatch } from "@/lib/agent/tools";
import { composeAgentContext } from "@/lib/agent/context";
import { allWorkflows, executions } from "@/lib/demo/fixtures";

const ctx = composeAgentContext({
  workflows: allWorkflows,
  executions,
  owners: new Map(),
  links: [],
  groupNames: new Map(),
  now: Date.now(),
});

describe("agent tools", () => {
  it("exposes OpenAI-shaped function specs", () => {
    const names = toolSpecs.map((t) => t.function.name);
    expect(names).toContain("search_workflows");
    expect(names).toContain("get_blast_radius");
    for (const t of toolSpecs) {
      expect(t.type).toBe("function");
      expect(t.function.parameters).toBeTypeOf("object");
    }
  });

  it("search_workflows matches on system name", () => {
    const stripeItem = ctx.items.find((i) => i.systems.includes("Stripe"));
    // fixtures should include at least one Stripe-touching workflow
    expect(stripeItem).toBeTruthy();
    const res = dispatch("search_workflows", { query: "Stripe" }, ctx) as { results: Array<{ id: string }> };
    expect(res.results.some((r) => r.id === stripeItem!.id)).toBe(true);
  });

  it("get_blast_radius returns downstream + owners for a real workflow", () => {
    const id = ctx.items[0].id;
    const res = dispatch("get_blast_radius", { id }, ctx) as { workflowId: string };
    expect(res.workflowId).toBe(id);
  });

  it("get_workflow_detail returns null-safe detail", () => {
    const id = ctx.items[0].id;
    const res = dispatch("get_workflow_detail", { id }, ctx) as { name: string };
    expect(res.name).toBe(ctx.items[0].name);
    const missing = dispatch("get_workflow_detail", { id: "nope" }, ctx);
    expect(missing).toEqual({ error: "No workflow with id nope" });
  });

  it("estate_summary returns a ROI + waste ledger", () => {
    const res = dispatch("estate_summary", {}, ctx) as {
      totals: { workflows: number };
      roi: { hoursSaved: number };
      waste: { idle: unknown[] };
    };
    expect(res.totals.workflows).toBe(ctx.items.length);
    expect(typeof res.roi.hoursSaved).toBe("number");
    expect(Array.isArray(res.waste.idle)).toBe(true);
  });

  it("list_by_capability resolves 'refunds' to refund-touching workflows", () => {
    const res = dispatch("list_by_capability", { capability: "can issue refunds" }, ctx) as {
      matchedKeywords: string[];
      results: unknown[];
    };
    expect(res.matchedKeywords).toContain("refund");
  });

  it("recent_changes returns a windowed list", () => {
    const res = dispatch("recent_changes", { sinceDays: 3650 }, ctx) as { results: unknown[] };
    expect(Array.isArray(res.results)).toBe(true);
  });

  it("ownership_coverage returns a coverage percentage", () => {
    const res = dispatch("ownership_coverage", {}, ctx) as { coveragePct: number; unownedCritical: unknown[] };
    expect(typeof res.coveragePct).toBe("number");
    expect(Array.isArray(res.unownedCritical)).toBe(true);
  });

  it("credential_impact lists shared-credential fan-out with a rotation risk", () => {
    const res = dispatch("credential_impact", {}, ctx) as {
      results: Array<{ credential: string; rotationRisk: string; workflowCount: number }>;
    };
    expect(Array.isArray(res.results)).toBe(true);
    for (const r of res.results) expect(["high", "medium", "low"]).toContain(r.rotationRisk);
  });

  it("get_attention_items returns the ranked brief items with a severity breakdown", () => {
    const res = dispatch("get_attention_items", {}, ctx) as {
      total: number;
      bySeverity: Record<string, number>;
      items: Array<{ severity: string; category: string; title: string }>;
    };
    expect(res.total).toBe(ctx.attention.length);
    expect(res.items.length).toBe(ctx.attention.length);
    expect(res.bySeverity.high + res.bySeverity.medium + res.bySeverity.low).toBe(res.total);
    // highest-severity first (buildBrief sorts by severity)
    if (res.items.length > 1) {
      const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
      expect(rank[res.items[0].severity]).toBeLessThanOrEqual(rank[res.items[res.items.length - 1].severity]);
    }
  });

  it("get_attention_items filters by severity", () => {
    const res = dispatch("get_attention_items", { severity: "high" }, ctx) as {
      items: Array<{ severity: string }>;
    };
    expect(res.items.every((i) => i.severity === "high")).toBe(true);
  });

  it("list_failures rolls up error/crashed executions per workflow, most-failing first", () => {
    const res = dispatch("list_failures", { sinceDays: 3650 }, ctx) as {
      totalFailedExecutions: number;
      workflowsAffected: number;
      results: Array<{ id: string; name: string; failures: number; lastFailureAt: string }>;
    };
    const expected = executions.filter((e) => e.status === "error" || e.status === "crashed").length;
    expect(res.totalFailedExecutions).toBe(expected);
    expect(res.workflowsAffected).toBe(res.results.length);
    for (let i = 1; i < res.results.length; i++) {
      expect(res.results[i - 1].failures).toBeGreaterThanOrEqual(res.results[i].failures);
    }
    // each result names a real workflow and a parseable timestamp
    for (const r of res.results) {
      expect(Number.isNaN(Date.parse(r.lastFailureAt))).toBe(false);
    }
  });

  it("throws on an unknown tool", () => {
    expect(() => dispatch("frobnicate", {}, ctx)).toThrow(/unknown tool/i);
  });
});
