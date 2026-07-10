import { describe, it, expect, vi } from "vitest";
import { runAgent, type ChatClient } from "@/lib/agent/run";
import { composeAgentContext } from "@/lib/agent/context";
import { allWorkflows, executions } from "@/lib/demo/fixtures";

const ctx = composeAgentContext({
  workflows: allWorkflows,
  executions,
  owners: new Map(),
  links: [],
  groupNames: new Map(),
  now: Date.now(),
});

function assistant(content: string | null, toolCalls?: Array<{ name: string; args: object }>) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content,
          tool_calls: toolCalls?.map((c, i) => ({
            id: `call_${i}`,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
  };
}

describe("runAgent", () => {
  it("executes a requested tool then returns the final answer", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(assistant(null, [{ name: "search_workflows", args: { query: "Stripe" } }]))
      .mockResolvedValueOnce(assistant("Two workflows touch Stripe."));
    const client: ChatClient = { create };

    const out = await runAgent({ userText: "what touches Stripe?", context: ctx, client });

    expect(out.text).toBe("Two workflows touch Stripe.");
    expect(create).toHaveBeenCalledTimes(2);
    // the second call must include a tool result message
    const secondMessages = create.mock.calls[1][0].messages;
    expect(secondMessages.some((m: { role: string }) => m.role === "tool")).toBe(true);
  });

  it("passes prior thread history into the first model call (Claude-tag context)", async () => {
    const create = vi.fn().mockResolvedValueOnce(assistant("ack"));
    const client: ChatClient = { create };
    await runAgent({
      userText: "should we worry?",
      context: ctx,
      client,
      history: [{ role: "assistant", content: "⚠️ Refund Agent failed 3 times" }],
    });
    const messages = create.mock.calls[0][0].messages;
    expect(messages.some((m: { content: string }) => m.content.includes("Refund Agent failed"))).toBe(true);
  });

  it("stops at maxIters when the model keeps calling tools", async () => {
    const create = vi.fn().mockResolvedValue(assistant(null, [{ name: "search_workflows", args: { query: "x" } }]));
    const client: ChatClient = { create };
    const out = await runAgent({ userText: "loop", context: ctx, client, maxIters: 3 });
    expect(create).toHaveBeenCalledTimes(3);
    expect(out.text).toMatch(/couldn.t|unable|try again/i);
  });
});
