import { describe, expect, it } from "vitest";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/test/fixtures/n8n";
import type { Owner } from "@/lib/backoffice/types";

describe("composeRegistry", () => {
  const owners = new Map<string, Owner>([
    [
      "wf_lead_routing",
      {
        workflowId: "wf_lead_routing",
        team: "Sales Ops",
        slackChannelId: "C1",
        slackChannelName: "#sales-ops",
        escalationChannelId: null,
        confirmed: true,
        reasoning: null,
        source: "confirmed",
      },
    ],
  ]);

  const items = composeRegistry({ workflows: allWorkflows, executions, owners });
  const byId = (id: string) => items.find((i) => i.id === id)!;

  it("produces one item per workflow", () => {
    expect(items).toHaveLength(allWorkflows.length);
  });

  it("flags a failing, un-owned AI agent with tools as high risk", () => {
    const refund = byId("wf_refund_review_agent");
    expect(refund.risk.level).toBe("high");
    expect(refund.risk.reasons.join(" ")).toMatch(/no owner/i);
    expect(refund.owner).toBeNull();
    expect(refund.health.recentFailures).toBe(6);
  });

  it("rates an owned deterministic workflow low risk", () => {
    const lead = byId("wf_lead_routing");
    expect(lead.risk.level).toBe("low");
    expect(lead.owner?.team).toBe("Sales Ops");
  });

  it("derives criticality from customer-facing systems + active state", () => {
    expect(byId("wf_customer_onboarding").criticality).toBe("High");
  });
});
