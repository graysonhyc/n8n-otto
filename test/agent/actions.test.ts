import { describe, it, expect, vi } from "vitest";
import { agentToolset } from "@/lib/agent/actions";
import { composeAgentContext } from "@/lib/agent/context";
import { allWorkflows, executions } from "@/lib/demo/fixtures";
import type { LinearGateway } from "@/lib/linear/client";

const ctx = composeAgentContext({
  workflows: allWorkflows,
  executions,
  owners: new Map(),
  links: [],
  groupNames: new Map(),
  now: Date.now(),
});
const id = ctx.items[0].id;

describe("agentToolset — create_linear_ticket", () => {
  it("previews (does not file) when confirm is absent", async () => {
    const linear: LinearGateway = { createIssue: vi.fn() };
    const { runTool } = agentToolset(linear);
    const res = (await runTool("create_linear_ticket", { id }, ctx)) as { preview: unknown };
    expect(res.preview).toBeTruthy();
    expect(linear.createIssue).not.toHaveBeenCalled();
  });

  it("files when confirm is true", async () => {
    const linear: LinearGateway = {
      createIssue: vi.fn().mockResolvedValue({ id: "1", url: "https://linear.app/x/ISS-1", identifier: "ISS-1" }),
    };
    const { runTool } = agentToolset(linear);
    const res = (await runTool("create_linear_ticket", { id, confirm: true }, ctx)) as { filed: boolean; url: string };
    expect(res.filed).toBe(true);
    expect(res.url).toContain("linear.app");
    expect(linear.createIssue).toHaveBeenCalledOnce();
  });

  it("reports gracefully when Linear is unconfigured", async () => {
    const { runTool } = agentToolset(null);
    const res = (await runTool("create_linear_ticket", { id, confirm: true }, ctx)) as { error: string };
    expect(res.error).toMatch(/configured/i);
  });

  it("still routes read tools through the combined dispatcher", async () => {
    const { runTool } = agentToolset(null);
    const res = (await runTool("who_owns", { id }, ctx)) as { name: string };
    expect(res.name).toBe(ctx.items[0].name);
  });
});
