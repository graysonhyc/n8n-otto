import { describe, it, expect } from "vitest";
import { blastRadius } from "@/lib/derive/blast";
import type { WorkflowGraph } from "@/lib/derive/graph";

const graph: WorkflowGraph = {
  nodes: [
    {
      id: "a",
      kind: "workflow",
      name: "Refund Agent",
      type: "ai-agent-tools",
      risk: "high",
      ownerTeam: "Support",
      recentFailures: 3,
      groupKey: "pg:a|b",
    },
    {
      id: "b",
      kind: "workflow",
      name: "Ledger Sync",
      type: "deterministic",
      risk: "medium",
      ownerTeam: "RevOps",
      recentFailures: 0,
      groupKey: "pg:a|b",
    },
    {
      id: "c",
      kind: "workflow",
      name: "Unrelated",
      type: "deterministic",
      risk: "low",
      ownerTeam: "Ops",
      recentFailures: 0,
      groupKey: null,
    },
    { id: "system:Stripe", kind: "system", name: "Stripe" },
  ],
  edges: [
    { id: "calls:a->b", source: "a", target: "b", kind: "calls", tier: "A" },
    { id: "uses:a->system:Stripe", source: "a", target: "system:Stripe", kind: "uses-system", tier: "B" },
  ],
  groups: [{ key: "pg:a|b", name: "Refund process", workflowIds: ["a", "b"] }],
};

describe("blastRadius", () => {
  it("returns downstream workflows, systems, process group, and affected owners", () => {
    const r = blastRadius("a", graph);
    expect(r.downstreamWorkflowIds).toContain("b");
    expect(r.systems).toContain("Stripe");
    expect(r.processGroup?.name).toBe("Refund process");
    expect(r.affectedOwnerTeams).toEqual(["RevOps", "Support"]);
    expect(r.downstreamWorkflowIds).not.toContain("c");
  });

  it("follows shared-credential edges in both directions", () => {
    const withCred: WorkflowGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        { id: "cred:x:b-c", source: "b", target: "c", kind: "shares-credential", tier: "A", label: "Stripe key" },
      ],
    };
    // c shares a credential with b; from b's perspective both a-side calls and c are impacted.
    const r = blastRadius("b", withCred);
    expect(r.downstreamWorkflowIds).toEqual(["a", "c"]);
  });

  it("is empty for an isolated workflow", () => {
    const r = blastRadius("c", graph);
    expect(r.downstreamWorkflowIds).toEqual([]);
    expect(r.advisoryWorkflowIds).toEqual([]);
    expect(r.systems).toEqual([]);
    expect(r.processGroup).toBeNull();
  });

  it("puts same-system peers in advisory, not impact", () => {
    const withPeer: WorkflowGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        // c also uses Stripe but has no dependency edge to a → advisory only.
        { id: "uses:c->system:Stripe", source: "c", target: "system:Stripe", kind: "uses-system", tier: "B" },
      ],
    };
    const r = blastRadius("a", withPeer);
    expect(r.downstreamWorkflowIds).toContain("b"); // exact dep
    expect(r.downstreamWorkflowIds).not.toContain("c");
    expect(r.advisoryWorkflowIds).toEqual(["c"]); // same-system only
  });

  it("puts semantically-similar workflows in advisory", () => {
    const withSimilar: WorkflowGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        { id: "similar:a-c", source: "a", target: "c", kind: "similar", tier: "S", label: "0.9" },
      ],
    };
    const r = blastRadius("a", withSimilar);
    expect(r.advisoryWorkflowIds).toContain("c");
  });
});
