import { describe, expect, it } from "vitest";
import { groupBriefsByChannel } from "@/lib/brief/channels";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/lib/demo/fixtures";
import type { Owner } from "@/lib/backoffice/types";

const NOW = Date.parse("2026-07-10T09:00:00+02:00");

function owner(workflowId: string, channelId: string | null, team = "Growth"): Owner {
  return {
    workflowId,
    team,
    slackChannelId: channelId,
    slackChannelName: channelId ? `#${team.toLowerCase()}` : null,
    escalationChannelId: null,
    confirmed: true,
    reasoning: null,
    source: "confirmed",
  };
}

describe("groupBriefsByChannel", () => {
  it("produces one brief per distinct channel and skips unowned workflows", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([
      [ids[0], owner(ids[0], "C_A")],
      [ids[1], owner(ids[1], "C_A")],
      [ids[2], owner(ids[2], "C_B")],
      // ids[3..] intentionally unowned → no channel
    ]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });

    const briefs = groupBriefsByChannel({
      items,
      executions,
      changes: new Map(),
      attention: [],
      sharedCredentials: [],
      now: NOW,
    });

    const channels = briefs.map((b) => b.channelId).sort();
    expect(channels).toEqual(["C_A", "C_B"]);
    expect(briefs.every((b) => b.daily.yesterday !== undefined)).toBe(true);
  });

  it("routes unowned workflows to the master channel when one is given", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([[ids[0], owner(ids[0], "C_A")]]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const briefs = groupBriefsByChannel({
      items,
      executions,
      changes: new Map(),
      attention: [],
      sharedCredentials: [],
      now: NOW,
      masterChannelId: "C_MASTER",
    });
    const channels = briefs.map((b) => b.channelId).sort();
    // owned workflow → C_A; every other (unowned) workflow → the master channel
    expect(channels).toEqual(["C_A", "C_MASTER"]);
  });

  it("scopes yesterday stats to only the channel's workflows", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([[ids[0], owner(ids[0], "C_ONLY")]]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const briefs = groupBriefsByChannel({
      items,
      executions,
      changes: new Map(),
      attention: [],
      sharedCredentials: [],
      now: NOW,
    });
    expect(briefs).toHaveLength(1);
    // Only the single owned workflow can be counted; ≤1 active regardless of whether it ran.
    expect(briefs[0].daily.yesterday.activeWorkflows).toBeLessThanOrEqual(1);
  });

  it("routes attention items to their workflow's channel only", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([
      [ids[0], owner(ids[0], "C_A")],
      [ids[1], owner(ids[1], "C_B")],
    ]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const attention = [
      {
        key: "k1",
        severity: "high" as const,
        category: "incident" as const,
        title: "x",
        whatHappened: "",
        whyItMatters: "",
        suggestedOwner: "",
        recommendedAction: "",
        workflowId: ids[0],
        actions: [],
      },
    ];
    const briefs = groupBriefsByChannel({
      items,
      executions,
      changes: new Map(),
      attention,
      sharedCredentials: [],
      now: NOW,
    });
    const a = briefs.find((b) => b.channelId === "C_A")!;
    const b = briefs.find((b) => b.channelId === "C_B")!;
    expect(a.attention).toHaveLength(1);
    expect(b.attention).toHaveLength(0);
  });
});
