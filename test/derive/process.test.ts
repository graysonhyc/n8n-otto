import { describe, it, expect } from "vitest";
import {
  computeProcessGroups,
  computeProcessGroupsMerged,
  callProcessPairs,
  mergeAuthoredGroups,
  type ProcessGroup,
} from "@/lib/derive/process";
import type { ManualLink } from "@/lib/backoffice/types";
import type { N8nWorkflow } from "@/lib/n8n/types";

// Minimal workflow with one Execute-Workflow node calling `callee`.
function caller(id: string, callee: string): N8nWorkflow {
  return {
    id,
    name: id,
    active: true,
    nodes: [
      {
        name: "call",
        type: "n8n-nodes-base.executeWorkflow",
        parameters: { workflowId: { value: callee } },
      },
    ],
    connections: {},
  };
}

function leaf(id: string): N8nWorkflow {
  return { id, name: id, active: true, nodes: [], connections: {} };
}

const link = (fromId: string, toId: string, relation = "part-of-process"): ManualLink => ({
  id: `${fromId}-${toId}`,
  fromId,
  toId,
  relation: relation as ManualLink["relation"],
  source: "manual",
});

describe("computeProcessGroups", () => {
  it("clusters transitively-linked workflows into one group", () => {
    const groups = computeProcessGroups([link("a", "b"), link("b", "c")], new Map());
    expect(groups).toHaveLength(1);
    expect([...groups[0].workflowIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores non-process relations", () => {
    const groups = computeProcessGroups([link("a", "b", "depends-on")], new Map());
    expect(groups).toHaveLength(0);
  });

  it("produces a stable key independent of link direction and attaches a stored name", () => {
    const g1 = computeProcessGroups([link("b", "a")], new Map())[0];
    const g2 = computeProcessGroups([link("a", "b")], new Map())[0];
    expect(g1.key).toEqual(g2.key);
    const named = computeProcessGroups([link("a", "b")], new Map([[g1.key, "Refund Process"]]))[0];
    expect(named.name).toEqual("Refund Process");
  });

  it("falls back to a default name when unnamed", () => {
    const g = computeProcessGroups([link("a", "b")], new Map())[0];
    expect(g.name).toMatch(/linked/i);
  });

  it("keeps separate components as separate groups", () => {
    const groups = computeProcessGroups([link("a", "b"), link("c", "d")], new Map());
    expect(groups).toHaveLength(2);
  });
});

describe("mergeAuthoredGroups", () => {
  const derived: ProcessGroup[] = [
    { key: "pg:a|b|c", name: "Business process", workflowIds: ["a", "b", "c"] },
  ];

  it("surfaces a one-workflow authored SOP the auto-detector would never form", () => {
    const merged = mergeAuthoredGroups(
      [{ id: "fin1", name: "Finance SOP", workflowIds: ["z"] }],
      [],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ key: "sop:fin1", name: "Finance SOP", workflowIds: ["z"] });
  });

  it("lets an authored SOP claim workflows away from an overlapping derived cluster", () => {
    const merged = mergeAuthoredGroups(
      [{ id: "fin1", name: "Finance SOP", workflowIds: ["b"] }],
      derived,
    );
    const authored = merged.find((g) => g.key === "sop:fin1")!;
    const leftover = merged.find((g) => g.key === "pg:a|b|c")!;
    expect(authored.workflowIds).toEqual(["b"]);
    expect(leftover.workflowIds).toEqual(["a", "c"]); // b removed, still >=2 so kept
  });

  it("drops a derived cluster that falls below two steps after the SOP claims it", () => {
    const twoStep: ProcessGroup[] = [{ key: "pg:a|b", name: "Business process", workflowIds: ["a", "b"] }];
    const merged = mergeAuthoredGroups(
      [{ id: "fin1", name: "Finance SOP", workflowIds: ["b"] }],
      twoStep,
    );
    expect(merged.map((g) => g.key)).toEqual(["sop:fin1"]);
  });

  it("returns derived groups unchanged when there are no authored SOPs", () => {
    expect(mergeAuthoredGroups([], derived)).toEqual(derived);
  });
});

describe("callProcessPairs — utility exclusion", () => {
  it("keeps a linear call chain (callee with a single caller)", () => {
    const wfs = [caller("a", "b"), leaf("b")];
    expect(callProcessPairs(wfs)).toEqual([["a", "b"]]);
  });

  it("excludes a shared utility called by >=3 distinct workflows", () => {
    // util `u` is called by a, b, c — shared infrastructure, not a linked group.
    const wfs = [caller("a", "u"), caller("b", "u"), caller("c", "u"), leaf("u")];
    expect(callProcessPairs(wfs)).toEqual([]);
  });

  it("does not collapse unrelated callers of a utility into one group", () => {
    const wfs = [caller("a", "u"), caller("b", "u"), caller("c", "u"), leaf("u")];
    const groups = computeProcessGroupsMerged(wfs, [], new Map());
    expect(groups).toHaveLength(0);
  });
});

describe("default group name", () => {
  it('names an unnamed derived group "Linked workflows"', () => {
    const g = computeProcessGroups([link("a", "b")], new Map())[0];
    expect(g.name).toBe("Linked workflows");
  });
});
