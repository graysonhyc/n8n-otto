import { describe, it, expect } from "vitest";
import { excludeArchived } from "@/lib/n8n/filter";
import type { N8nWorkflow } from "@/lib/n8n/types";

const wf = (id: string, isArchived?: boolean): N8nWorkflow =>
  ({ id, name: id, active: true, isArchived, nodes: [], connections: {} }) as N8nWorkflow;

describe("excludeArchived", () => {
  it("drops archived workflows, keeps the rest", () => {
    const out = excludeArchived([wf("a"), wf("b", true), wf("c", false)]);
    expect(out.map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("keeps workflows with no isArchived field (older n8n)", () => {
    expect(excludeArchived([wf("a")]).map((w) => w.id)).toEqual(["a"]);
  });
});
