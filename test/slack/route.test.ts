import { describe, expect, it } from "vitest";
import { resolveRouting } from "@/lib/slack/route";
import type { Owner } from "@/lib/backoffice/types";

const owner: Owner = {
  workflowId: "wf_x",
  team: "Support Ops",
  slackChannelId: "C_SUPPORT",
  slackChannelName: "#support-ops",
  escalationChannelId: null,
  confirmed: true,
  reasoning: null,
  source: "confirmed",
};

describe("resolveRouting", () => {
  it("routes to the owner's channel when assigned", () => {
    const r = resolveRouting(owner, "C_MASTER");
    expect(r).toEqual({
      channelId: "C_SUPPORT",
      routedByOwner: true,
      channelName: "#support-ops",
    });
  });

  it("falls back to the master channel when unassigned", () => {
    const r = resolveRouting(null, "C_MASTER");
    expect(r.channelId).toBe("C_MASTER");
    expect(r.routedByOwner).toBe(false);
  });

  it("falls back when the owner has a team but no channel", () => {
    const r = resolveRouting({ ...owner, slackChannelId: null }, "C_MASTER");
    expect(r.channelId).toBe("C_MASTER");
    expect(r.routedByOwner).toBe(false);
  });
});
