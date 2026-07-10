import { describe, expect, it } from "vitest";
import { classify } from "@/lib/derive/classify";
import {
  customerOnboarding,
  leadRouting,
  ptoApprovalBot,
  refundReviewAgent,
} from "@/lib/demo/fixtures";

describe("classify", () => {
  it("classifies an AI agent with tools", () => {
    const c = classify(refundReviewAgent);
    expect(c.type).toBe("ai-agent-tools");
    expect(c.usesAI).toBe(true);
    expect(c.hasAgent).toBe(true);
    expect(c.toolNames.sort()).toEqual(["Gmail draft", "Stripe lookup", "Zendesk"]);
    expect(c.model).toBe("gpt-4.1");
    expect(c.trigger.kind).toBe("webhook");
    expect(c.systems).toEqual(expect.arrayContaining(["Zendesk", "Stripe", "Gmail"]));
  });

  it("classifies a deterministic workflow", () => {
    const c = classify(customerOnboarding);
    expect(c.type).toBe("deterministic");
    expect(c.usesAI).toBe(false);
    expect(c.trigger.kind).toBe("webhook"); // Stripe app trigger
    expect(c.systems).toEqual(expect.arrayContaining(["Stripe", "HubSpot", "Slack"]));
  });

  it("surfaces human-in-the-loop as a flag, not its own type", () => {
    const c = classify(ptoApprovalBot);
    expect(c.humanInLoop).toBe(true);
    expect(c.trigger.kind).toBe("form");
    // HITL is a flag now, not a type: an LLM-using workflow with no agent
    // classifies as ai-assisted regardless of the wait/approval node.
    expect(c.type).toBe("ai-assisted");
  });

  it("reads systems from plain app nodes", () => {
    const c = classify(leadRouting);
    expect(c.systems).toEqual(expect.arrayContaining(["HubSpot", "Salesforce"]));
    expect(c.type).toBe("deterministic");
  });
});
