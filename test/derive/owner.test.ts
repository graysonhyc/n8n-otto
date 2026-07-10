import { describe, expect, it } from "vitest";
import { suggestOwner } from "@/lib/derive/owner";
import type { N8nWorkflow } from "@/lib/n8n/types";

const base: N8nWorkflow = {
  id: "wf_test",
  name: "Test",
  active: true,
  nodes: [],
  connections: {},
};

describe("suggestOwner", () => {
  it("suggests the n8n project name with high confidence", () => {
    const s = suggestOwner({ ...base, homeProject: { id: "p", name: "Support Ops" } });
    expect(s).toEqual({
      team: "Support Ops",
      confidence: "high",
      reasoning: expect.stringContaining("Support Ops"),
    });
  });

  it("falls back to a team tag with medium confidence", () => {
    const s = suggestOwner({ ...base, tags: [{ name: "production" }, { name: "revops" }] });
    expect(s?.team).toBe("RevOps");
    expect(s?.confidence).toBe("medium");
  });

  it("returns null when signals are only ambiguous systems (unsure → empty)", () => {
    // A Stripe workflow with no project and no team tag — must NOT guess "Finance".
    const s = suggestOwner({
      ...base,
      tags: [{ name: "production" }],
      nodes: [
        {
          name: "Stripe",
          type: "n8n-nodes-base.stripe",
          credentials: { stripeApi: { id: "c", name: "Stripe" } },
        },
      ],
    });
    expect(s).toBeNull();
  });

  it("prefers the project over a tag", () => {
    const s = suggestOwner({
      ...base,
      homeProject: { id: "p", name: "RevOps" },
      tags: [{ name: "support" }],
    });
    expect(s?.team).toBe("RevOps");
    expect(s?.confidence).toBe("high");
  });
});
