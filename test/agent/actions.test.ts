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

describe("agentToolset — create_sop_from_thread", () => {
  const twoIds = [ctx.items[0].id, ctx.items[1].id];

  it("creates the SOP with the given name, description, and valid members", async () => {
    const createSop = vi.fn().mockResolvedValue({ id: "sop-1", name: "Refund handling", description: "d", updatedAt: "" });
    const { runTool } = agentToolset(null, { createSop });
    const res = (await runTool(
      "create_sop_from_thread",
      { name: "Refund handling", description: "How refunds flow", memberIds: twoIds },
      ctx,
    )) as { created: boolean; sopId: string; linkedWorkflows: string[] };
    expect(res.created).toBe(true);
    expect(res.sopId).toBe("sop-1");
    expect(res.linkedWorkflows).toEqual([ctx.items[0].name, ctx.items[1].name]);
    expect(createSop).toHaveBeenCalledWith("Refund handling", twoIds, "How refunds flow");
  });

  it("silently drops unknown workflow ids but still creates from the valid ones", async () => {
    const createSop = vi.fn().mockResolvedValue({ id: "sop-2", name: "P", description: null, updatedAt: "" });
    const { runTool } = agentToolset(null, { createSop });
    const res = (await runTool(
      "create_sop_from_thread",
      { name: "P", memberIds: [ctx.items[0].id, "nope-not-real"] },
      ctx,
    )) as { created: boolean; skippedUnknownIds: string[] };
    expect(res.created).toBe(true);
    expect(createSop).toHaveBeenCalledWith("P", [ctx.items[0].id], null);
    expect(res.skippedUnknownIds).toEqual(["nope-not-real"]);
  });

  it("refuses to create an SOP with no name", async () => {
    const createSop = vi.fn();
    const { runTool } = agentToolset(null, { createSop });
    const res = (await runTool("create_sop_from_thread", { name: "  ", memberIds: twoIds }, ctx)) as { error: string };
    expect(res.error).toMatch(/name/i);
    expect(createSop).not.toHaveBeenCalled();
  });
});
