import { describe, it, expect } from "vitest";
import { cosine, similarPairs, purposeDoc } from "@/lib/derive/similarity";
import type { N8nWorkflow } from "@/lib/n8n/types";

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 when a vector is empty/zero", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("similarPairs", () => {
  const entries = [
    { id: "a", vector: [1, 0, 0] },
    { id: "b", vector: [0.98, 0.2, 0] }, // very close to a
    { id: "c", vector: [0, 0, 1] }, // orthogonal
  ];

  it("keeps only pairs at or above the threshold, highest first", () => {
    const pairs = similarPairs(entries, 0.83, 3);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "a", b: "b" });
    expect(pairs[0].score).toBeGreaterThan(0.83);
  });

  it("caps to top-K per workflow", () => {
    const many = [
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [1, 0.01] },
      { id: "c", vector: [1, 0.02] },
      { id: "d", vector: [1, 0.03] },
    ];
    const pairs = similarPairs(many, 0.9, 1);
    // with k=1, no workflow appears in more than one kept pair
    const counts = new Map<string, number>();
    for (const p of pairs) {
      counts.set(p.a, (counts.get(p.a) ?? 0) + 1);
      counts.set(p.b, (counts.get(p.b) ?? 0) + 1);
    }
    expect([...counts.values()].every((n) => n <= 1)).toBe(true);
  });
});

describe("purposeDoc", () => {
  it("includes the name, description, integrations and node kinds", () => {
    const wf = {
      id: "w",
      name: "Churn Risk Agent",
      description: "Scores accounts for churn",
      active: true,
      connections: {},
      nodes: [
        { name: "t", type: "n8n-nodes-base.scheduleTrigger", parameters: {} },
        { name: "hs", type: "n8n-nodes-base.hubspot", parameters: {} },
      ],
    } as unknown as N8nWorkflow;
    const doc = purposeDoc(wf);
    expect(doc).toContain("Churn Risk Agent");
    expect(doc).toContain("Scores accounts for churn");
    expect(doc).toContain("HubSpot");
  });
});
