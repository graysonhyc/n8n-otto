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

    const briefs = groupBriefsByChannel({ items, executions, attention: [], now: NOW });

    const channels = briefs.map((b) => b.channelId).sort();
    expect(channels).toEqual(["C_A", "C_B"]);
    expect(briefs.every((b) => b.stats.dateLabel !== undefined)).toBe(true);
  });

  it("routes unowned workflows to the master channel when one is given", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([[ids[0], owner(ids[0], "C_A")]]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const briefs = groupBriefsByChannel({
      items,
      executions,
      attention: [],
      now: NOW,
      masterChannelId: "C_MASTER",
    });
    const channels = briefs.map((b) => b.channelId).sort();
    // owned workflow → C_A; every other (unowned) workflow → the master channel
    expect(channels).toEqual(["C_A", "C_MASTER"]);
  });

  it("scopes active count to only the channel's workflows", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([[ids[0], owner(ids[0], "C_ONLY")]]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const briefs = groupBriefsByChannel({ items, executions, attention: [], now: NOW });
    expect(briefs).toHaveLength(1);
    // Only the single owned workflow is in this channel's bucket.
    expect(briefs[0].stats.active + briefs[0].stats.paused).toBe(1);
  });

  it("counts archived workflows per channel and seeds an archived-only team", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([[ids[0], owner(ids[0], "C_A")]]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const briefs = groupBriefsByChannel({
      items,
      executions,
      attention: [],
      archived: [
        { channelId: "C_A", channelName: "#growth" },
        { channelId: "C_ARCHIVED_ONLY", channelName: "#legacy" },
      ],
      now: NOW,
    });
    const a = briefs.find((b) => b.channelId === "C_A")!;
    const legacy = briefs.find((b) => b.channelId === "C_ARCHIVED_ONLY")!;
    expect(a.stats.archived).toBe(1);
    // A team with only archived workflows still gets a brief (0 active, 1 archived).
    expect(legacy.stats.active).toBe(0);
    expect(legacy.stats.archived).toBe(1);
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
        owned: false,
        actions: [],
      },
    ];
    const briefs = groupBriefsByChannel({ items, executions, attention, now: NOW });
    const a = briefs.find((b) => b.channelId === "C_A")!;
    const b = briefs.find((b) => b.channelId === "C_B")!;
    expect(a.attention).toHaveLength(1);
    expect(b.attention).toHaveLength(0);
  });

  it("routes a workflow-less item to every team whose workflow it lists", () => {
    // A shared-credential brief (workflowId null) spanning a workflow in each team
    // must reach both teams, not be dropped.
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([
      [ids[0], owner(ids[0], "C_A")],
      [ids[1], owner(ids[1], "C_B")],
    ]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const attention = [
      {
        key: "shared:cred1",
        severity: "medium" as const,
        category: "shared-resource" as const,
        title: "cred shared",
        whatHappened: "",
        whyItMatters: "",
        suggestedOwner: "",
        recommendedAction: "",
        workflowId: null,
        workflowIds: [ids[0], ids[1]],
        owned: true,
        actions: [],
      },
    ];
    const briefs = groupBriefsByChannel({ items, executions, attention, now: NOW });
    const a = briefs.find((b) => b.channelId === "C_A")!;
    const b = briefs.find((b) => b.channelId === "C_B")!;
    expect(a.attention).toHaveLength(1);
    expect(b.attention).toHaveLength(1);
  });
});
