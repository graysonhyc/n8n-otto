import { describe, it, expect } from "vitest";
import { computeProcessGroups } from "@/lib/derive/process";
import type { ManualLink } from "@/lib/backoffice/types";

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
    expect(g.name).toMatch(/process/i);
  });

  it("keeps separate components as separate groups", () => {
    const groups = computeProcessGroups([link("a", "b"), link("c", "d")], new Map());
    expect(groups).toHaveLength(2);
  });
});
