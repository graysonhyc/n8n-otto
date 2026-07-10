import { describe, it, expect } from "vitest";
import { buildTicket } from "@/lib/linear/ticket";
import type { RegistryItem } from "@/lib/derive/registry";
import type { BlastRadius } from "@/lib/derive/blast";

const item = {
  id: "wf1",
  name: "Refund Agent",
  type: "ai-agent-tools",
  active: true,
  criticality: "High",
  systems: ["Stripe", "Zendesk"],
  toolNames: ["issue_refund"],
  humanInLoop: false,
  owner: { team: "Support", slackChannelName: "support-ops" },
  health: { recentFailures: 4, lastStatus: "error" },
  risk: { level: "high", label: "High risk", reasons: ["unreviewed agent"] },
  lastChange: "2026-07-01T00:00:00.000Z",
  timeSavedPerExecution: 15,
} as unknown as RegistryItem;

const blast: BlastRadius = {
  workflowId: "wf1",
  downstreamWorkflowIds: ["wf2"],
  systems: ["Stripe"],
  processGroup: { key: "pg:wf1|wf2", name: "Refund process", workflowIds: ["wf1", "wf2"] },
  affectedOwnerTeams: ["RevOps", "Support"],
};

describe("buildTicket", () => {
  it("titles with the workflow name and a failure headline", () => {
    const t = buildTicket({ item, blast, changes: [] });
    expect(t.title).toContain("Refund Agent");
    expect(t.title.toLowerCase()).toContain("fail");
  });

  it("puts owner, criticality, blast radius, and a runbook into the body", () => {
    const t = buildTicket({ item, blast, changes: [] });
    expect(t.description).toContain("Support");
    expect(t.description).toContain("High");
    expect(t.description).toMatch(/Refund process/);
    expect(t.description).toMatch(/RevOps/); // affected owner team surfaced
    expect(t.description.toLowerCase()).toContain("blast radius");
  });

  it("summarises recent changes when present", () => {
    const t = buildTicket({
      item,
      blast,
      changes: [{ kind: "model", old: "gpt-4o-mini", new: "gpt-4o" }],
    });
    expect(t.description).toMatch(/model/i);
    expect(t.description).toContain("gpt-4o");
  });

  it("still builds for an unowned, isolated workflow", () => {
    const bare = { ...item, owner: null } as RegistryItem;
    const emptyBlast: BlastRadius = {
      workflowId: "wf1",
      downstreamWorkflowIds: [],
      systems: [],
      processGroup: null,
      affectedOwnerTeams: [],
    };
    const t = buildTicket({ item: bare, blast: emptyBlast, changes: [] });
    expect(t.description).toContain("Unassigned");
  });
});
