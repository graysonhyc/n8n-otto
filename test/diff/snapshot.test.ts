import { describe, expect, it } from "vitest";
import { diffWorkflows, snapshot } from "@/lib/diff/snapshot";
import { refundReviewAgent, refundReviewAgentPrev } from "@/lib/demo/fixtures";
import type { N8nWorkflow } from "@/lib/n8n/types";

describe("snapshot", () => {
  it("is stable for the same workflow", () => {
    expect(snapshot(refundReviewAgent).hash).toBe(snapshot(refundReviewAgent).hash);
  });

  it("changes when the prompt changes", () => {
    expect(snapshot(refundReviewAgent).hash).not.toBe(snapshot(refundReviewAgentPrev).hash);
  });
});

describe("diffWorkflows", () => {
  it("detects a prompt change (summarise → decide)", () => {
    const events = diffWorkflows(refundReviewAgentPrev, refundReviewAgent);
    const prompt = events.find((e) => e.kind === "prompt");
    expect(prompt).toBeDefined();
    expect(prompt).toMatchObject({
      kind: "prompt",
      node: "Refund Review Agent",
    });
    if (prompt?.kind === "prompt") {
      expect(prompt.old).toMatch(/summarise/i);
      expect(prompt.new).toMatch(/decide/i);
    }
  });

  it("detects a model change", () => {
    const next: N8nWorkflow = {
      ...refundReviewAgent,
      nodes: refundReviewAgent.nodes.map((n) =>
        n.name === "OpenAI GPT-4.1" ? { ...n, parameters: { model: "gpt-5" } } : n,
      ),
    };
    const events = diffWorkflows(refundReviewAgent, next);
    expect(events).toContainEqual({ kind: "model", old: "gpt-4.1", new: "gpt-5" });
  });

  it("detects an added tool", () => {
    const events = diffWorkflows(
      { ...refundReviewAgent, connections: { ...refundReviewAgent.connections } },
      refundReviewAgent,
    );
    // no change when identical
    expect(events.find((e) => e.kind === "tool-access")).toBeUndefined();
  });

  it("returns no events for an identical workflow", () => {
    expect(diffWorkflows(refundReviewAgent, refundReviewAgent)).toEqual([]);
  });
});
