import { describe, it, expect } from "vitest";
import { classifySuggestions, buildClusters, type SuggestionInput } from "@/lib/derive/suggestions";
import type { N8nWorkflow, N8nNode } from "@/lib/n8n/types";

// ---- classifySuggestions ----------------------------------------------------

const base = (over: Partial<SuggestionInput> = {}): SuggestionInput => ({
  clusters: [],
  sopByWorkflow: new Map(),
  dismissed: new Set(),
  ...over,
});

describe("classifySuggestions", () => {
  it("suggests a new SOP when no member is assigned", () => {
    const out = classifySuggestions(
      base({ clusters: [{ memberIds: ["b", "a", "c"], confidence: "strong", reason: "call each other" }] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("new-sop");
    expect(out[0].memberIds).toEqual(["a", "b", "c"]);
    expect(out[0].targetSopId).toBeNull();
  });

  it("suggests add-to-sop when some members belong to exactly one SOP", () => {
    const out = classifySuggestions(
      base({
        clusters: [{ memberIds: ["a", "b", "c"], confidence: "strong", reason: "x" }],
        sopByWorkflow: new Map([["a", { id: "s1", name: "Refunds" }]]),
      }),
    );
    expect(out[0].kind).toBe("add-to-sop");
    expect(out[0].targetSopId).toBe("s1");
    expect(out[0].targetSopName).toBe("Refunds");
    expect(out[0].memberIds).toEqual(["b", "c"]);
  });

  it("skips clusters spanning two different SOPs", () => {
    const out = classifySuggestions(
      base({
        clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
        sopByWorkflow: new Map([
          ["a", { id: "s1", name: "A" }],
          ["b", { id: "s2", name: "B" }],
        ]),
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("skips add-to-sop when no members are actually missing", () => {
    const out = classifySuggestions(
      base({
        clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
        sopByWorkflow: new Map([
          ["a", { id: "s1", name: "A" }],
          ["b", { id: "s1", name: "A" }],
        ]),
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("filters out dismissed suggestions by stable id", () => {
    const first = classifySuggestions(
      base({ clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }] }),
    );
    const out = classifySuggestions(
      base({
        clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
        dismissed: new Set([first[0].id]),
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("gives the same id regardless of member order", () => {
    const a = classifySuggestions(base({ clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }] }));
    const b = classifySuggestions(base({ clusters: [{ memberIds: ["b", "a"], confidence: "strong", reason: "x" }] }));
    expect(a[0].id).toBe(b[0].id);
  });

  it("sorts strong suggestions before possible ones", () => {
    const out = classifySuggestions(
      base({
        clusters: [
          { memberIds: ["e", "f"], confidence: "possible", reason: "share" },
          { memberIds: ["a", "b"], confidence: "strong", reason: "call" },
        ],
      }),
    );
    expect(out[0].confidence).toBe("strong");
    expect(out[1].confidence).toBe("possible");
  });
});

// ---- buildClusters ----------------------------------------------------------

const callNode = (toId: string): N8nNode => ({
  name: `call-${toId}`,
  type: "n8n-nodes-base.executeWorkflow",
  parameters: { workflowId: toId },
});

const postgresNode = (table: string): N8nNode => ({
  name: `pg-${table}`,
  type: "n8n-nodes-base.postgres",
  parameters: { table },
});

const wf = (id: string, nodes: N8nNode[]): N8nWorkflow => ({
  id,
  name: id,
  active: true,
  nodes,
  connections: {},
});

describe("buildClusters", () => {
  it("makes one strong cluster from a call chain", () => {
    const clusters = buildClusters([wf("a", [callNode("b")]), wf("b", [])]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].confidence).toBe("strong");
    expect(clusters[0].memberIds).toEqual(["a", "b"]);
  });

  it("makes one possible cluster from a shared data source", () => {
    const clusters = buildClusters([
      wf("a", [postgresNode("orders")]),
      wf("b", [postgresNode("orders")]),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].confidence).toBe("possible");
    expect(clusters[0].memberIds).toEqual(["a", "b"]);
    expect(clusters[0].reason).toMatch(/Postgres:orders/);
  });

  it("merges a call edge and a shared source into a single strong cluster", () => {
    const clusters = buildClusters([
      wf("a", [callNode("b"), postgresNode("orders")]),
      wf("b", [postgresNode("orders")]),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].confidence).toBe("strong");
  });

  it("keeps unrelated workflows in separate clusters", () => {
    const clusters = buildClusters([
      wf("a", [callNode("b")]),
      wf("b", []),
      wf("c", [postgresNode("leads")]),
      wf("d", [postgresNode("leads")]),
    ]);
    expect(clusters).toHaveLength(2);
  });
});
