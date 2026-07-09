import { describe, expect, it } from "vitest";
import {
  agentToolEdges,
  sharedCredentialEdges,
  systemEdges,
  workflowCallEdges,
} from "@/lib/derive/edges";
import {
  customerOnboarding,
  leadRouting,
  refundReviewAgent,
} from "@/lib/demo/fixtures";

describe("edge extraction", () => {
  it("Tier A: workflow → workflow from Execute Workflow nodes", () => {
    const edges = workflowCallEdges(customerOnboarding);
    expect(edges).toContainEqual({
      from: "wf_customer_onboarding",
      to: "wf_welcome_email_agent",
      kind: "calls",
      tier: "A",
    });
  });

  it("Tier A: agent → tool from ai_tool connections", () => {
    const edges = agentToolEdges(refundReviewAgent);
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => e.to).sort()).toEqual([
      "Gmail draft",
      "Stripe lookup",
      "Zendesk",
    ]);
    expect(edges.every((e) => e.tier === "A" && e.kind === "agent-tool")).toBe(true);
  });

  it("Tier A: shared-credential edge between two workflows", () => {
    const edges = sharedCredentialEdges([customerOnboarding, leadRouting]);
    const shared = edges.find((e) => e.credentialId === "cred_hubspot_prod");
    expect(shared).toBeDefined();
    expect([shared!.from, shared!.to].sort()).toEqual([
      "wf_customer_onboarding",
      "wf_lead_routing",
    ]);
    expect(shared!.tier).toBe("A");
  });

  it("Tier B: workflow → system resource (Slack channel)", () => {
    const edges = systemEdges(customerOnboarding);
    const slack = edges.find((e) => e.system === "Slack");
    expect(slack).toBeDefined();
    expect(slack!.resource).toBe("#cs-alerts");
    expect(slack!.tier).toBe("B");
  });
});
