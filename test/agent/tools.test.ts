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

  it("throws on an unknown tool", () => {
    expect(() => dispatch("frobnicate", {}, ctx)).toThrow(/unknown tool/i);
  });
});
