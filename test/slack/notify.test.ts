import { describe, expect, it, vi } from "vitest";
import { notifyNewItems, type NotifyDeps } from "@/lib/slack/notify";
import type { BriefItem } from "@/lib/brief/build";
import type { Owner } from "@/lib/backoffice/types";

function item(key: string, workflowId: string | null): BriefItem {
  return {
    key,
    severity: "high",
    category: "incident",
    title: key,
    whatHappened: "",
    whyItMatters: "",
    suggestedOwner: "",
    recommendedAction: "",
    workflowId,
    actions: [],
  };
}

function owner(workflowId: string, channelId: string | null): Owner {
  return {
    workflowId,
    team: "Growth",
    slackChannelId: channelId,
    slackChannelName: channelId ? "#growth" : null,
    escalationChannelId: null,
    confirmed: true,
    reasoning: null,
    source: "confirmed",
  };
}

function deps(over: Partial<NotifyDeps>): NotifyDeps {
  return {
    items: [],
    owners: new Map(),
    notified: new Set(),
    states: new Map(),
    post: vi.fn(async () => {}),
    markNotified: vi.fn(async () => {}),
    clearNotified: vi.fn(async () => {}),
    ...over,
  };
}

describe("notifyNewItems", () => {
  it("posts a new owned item and marks it notified", async () => {
    const d = deps({
      items: [item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", "C1")]]),
    });
    const res = await notifyNewItems(d);
    expect(d.post).toHaveBeenCalledWith("C1", d.items[0]);
    expect(d.markNotified).toHaveBeenCalledWith("incident:w1");
    expect(res.posted).toBe(1);
  });

  it("skips items already notified", async () => {
    const d = deps({
      items: [item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", "C1")]]),
      notified: new Set(["incident:w1"]),
    });
    const res = await notifyNewItems(d);
    expect(d.post).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("skips dismissed and acknowledged items", async () => {
    const d = deps({
      items: [item("k:dismissed", "w1"), item("k:ack", "w2")],
      owners: new Map([
        ["w1", owner("w1", "C1")],
        ["w2", owner("w2", "C2")],
      ]),
      states: new Map([
        ["k:dismissed", "dismissed"],
        ["k:ack", "acknowledged"],
      ]),
    });
    const res = await notifyNewItems(d);
    expect(d.post).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("skips items with no owner channel (incl. null workflow)", async () => {
    const d = deps({
      items: [item("shared:c1", null), item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", null)]]), // owner exists but no channel
    });
    const res = await notifyNewItems(d);
    expect(d.post).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("falls back to the master channel when an item has no owner channel", async () => {
    const d = deps({
      items: [item("shared:c1", null), item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", null)]]), // owner but no channel
      masterChannelId: "C_MASTER",
    });
    const res = await notifyNewItems(d);
    expect(d.post).toHaveBeenCalledWith("C_MASTER", d.items[0]);
    expect(d.post).toHaveBeenCalledWith("C_MASTER", d.items[1]);
    expect(res.posted).toBe(2);
  });

  it("prefers the owner channel over the master channel when both exist", async () => {
    const d = deps({
      items: [item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", "C_OWNER")]]),
      masterChannelId: "C_MASTER",
    });
    await notifyNewItems(d);
    expect(d.post).toHaveBeenCalledWith("C_OWNER", d.items[0]);
  });

  it("re-arms notified keys whose condition has resolved", async () => {
    const d = deps({
      items: [], // nothing current
      notified: new Set(["incident:gone", "incident:also-gone"]),
    });
    const res = await notifyNewItems(d);
    expect(d.clearNotified).toHaveBeenCalledWith(
      expect.arrayContaining(["incident:gone", "incident:also-gone"]),
    );
    expect(res.rearmed).toBe(2);
  });
});
