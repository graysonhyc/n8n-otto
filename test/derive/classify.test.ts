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

  it("detects a human-in-the-loop workflow via a wait node", () => {
    const c = classify(ptoApprovalBot);
    expect(c.humanInLoop).toBe(true);
    expect(c.trigger.kind).toBe("form");
    // uses an LLM but no agent → ai-assisted takes priority label unless HITL is the story;
    // we surface HITL as its own type here since there is no agent.
    expect(["ai-assisted", "human-in-loop"]).toContain(c.type);
  });

  it("reads systems from plain app nodes", () => {
    const c = classify(leadRouting);
    expect(c.systems).toEqual(expect.arrayContaining(["HubSpot", "Salesforce"]));
    expect(c.type).toBe("deterministic");
  });
});
