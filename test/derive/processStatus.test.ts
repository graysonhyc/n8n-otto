import { describe, it, expect } from "vitest";
import { processStatus } from "@/lib/derive/processStatus";
import type { ProcessGroup } from "@/lib/derive/process";
import type { RegistryItem } from "@/lib/derive/registry";

function item(over: Partial<RegistryItem>): RegistryItem {
  return {
    id: "x",
    name: "X",
    owner: null,
    risk: { level: "low", label: "", reasons: [] },
    health: { recentFailures: 0, lastStatus: "success" },
    ...over,
  } as unknown as RegistryItem;
}

const group: ProcessGroup = { key: "pg:a|b|c", name: "Refund process", workflowIds: ["a", "b", "c"] };

const items = [
  item({ id: "a", name: "Intake", owner: { team: "Support" } as RegistryItem["owner"] }),
  item({ id: "b", name: "Decision", owner: { team: "RevOps" } as RegistryItem["owner"] }),
  item({ id: "c", name: "Payout" }),
];

const callPairs: Array<[string, string]> = [
  ["a", "b"],
  ["b", "c"],
];

describe("processStatus", () => {
  it("orders steps caller → callee (topological)", () => {
    const s = processStatus(group, items, callPairs);
    expect(s.steps.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("is healthy when no step is failing", () => {
    const s = processStatus(group, items, callPairs);
    expect(s.health).toBe("healthy");
    expect(s.stalledAt).toBeNull();
  });

  it("stalls at the first failing step", () => {
    const failing = items.map((i) => (i.id === "b" ? item({ ...i, health: { recentFailures: 4, lastStatus: "error" } }) : i));
    const s = processStatus(group, failing, callPairs);
    expect(s.health).toBe("stalled");
    expect(s.stalledAt).toMatchObject({ id: "b", name: "Decision" });
  });

  it("collects distinct owner teams", () => {
    const s = processStatus(group, items, callPairs);
    expect(s.owners.sort()).toEqual(["RevOps", "Support"]);
  });

  it("falls back to member order when there are no call edges", () => {
    const s = processStatus(group, items, []);
    expect(s.steps.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
