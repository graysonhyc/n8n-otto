import { describe, it, expect } from "vitest";
import { composeAgentContext } from "@/lib/agent/context";
import { allWorkflows, executions } from "@/lib/demo/fixtures";

describe("composeAgentContext", () => {
  it("composes registry items and a graph from a raw instance", () => {
    const ctx = composeAgentContext({
      workflows: allWorkflows,
      executions,
      owners: new Map(),
      links: [],
      groupNames: new Map(),
      now: Date.now(),
    });
    expect(ctx.items.length).toBe(allWorkflows.length);
    expect(ctx.graph.nodes.some((n) => n.kind === "workflow")).toBe(true);
    // every registry item is addressable by id (tools resolve workflows this way)
    expect(new Set(ctx.items.map((i) => i.id)).size).toBe(ctx.items.length);
  });

  it("surfaces a hand-authored SOP as a process group the agent can answer about", () => {
    const someWorkflowId = allWorkflows[0].id;
    const ctx = composeAgentContext({
      workflows: allWorkflows,
      executions,
      owners: new Map(),
      links: [],
      groupNames: new Map(),
      now: Date.now(),
      sops: [{ id: "fin1", name: "Finance SOP", workflowIds: [someWorkflowId] }],
    });
    const finance = ctx.graph.groups.find((g) => g.name === "Finance SOP");
    expect(finance).toBeDefined();
    expect(finance!.workflowIds).toContain(someWorkflowId);
  });
});
