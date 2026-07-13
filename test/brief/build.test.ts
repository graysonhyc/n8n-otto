import { describe, expect, it } from "vitest";
import { buildBrief } from "@/lib/brief/build";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/lib/demo/fixtures";
import type { ChangeEvent } from "@/lib/diff/snapshot";

const items = composeRegistry({ workflows: allWorkflows, executions, owners: new Map() });

const promptChange: ChangeEvent = {
  kind: "prompt",
  node: "Refund Review Agent",
  old: "Summarise the refund request for a human agent.",
  new: "Decide whether to approve or reject the refund and draft the reply.",
};

describe("buildBrief", () => {
  const brief = buildBrief({
    items,
    changes: new Map([["wf_refund_review_agent", [promptChange]]]),
    sharedCredentials: [
      {
        credentialId: "cred_hubspot_prod",
        credentialName: "HubSpot production",
        workflowIds: ["wf_customer_onboarding", "wf_lead_routing", "wf_pto_approval_bot"],
      },
    ],
  });

  it("surfaces a high-severity prompt change first", () => {
    expect(brief[0].severity).toBe("high");
    expect(brief[0].workflowId).toBe("wf_refund_review_agent");
    expect(brief[0].whatHappened).toMatch(/decide/i);
  });

  it("flags workflows with no owner", () => {
    expect(brief.some((b) => /no owner/i.test(b.title))).toBe(true);
  });

  it("flags a credential shared by 3+ workflows", () => {
    const shared = brief.find((b) => /HubSpot production/.test(b.title));
    expect(shared).toBeDefined();
    expect(shared!.whyItMatters).toMatch(/multiple workflows|break/i);
  });

  it("is sorted by severity (high → low)", () => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < brief.length; i++) {
      expect(rank[brief[i].severity]).toBeGreaterThanOrEqual(rank[brief[i - 1].severity]);
    }
  });

  it("appends a blast-radius note to the prompt-change item when downstream impact exists", () => {
    const withBlast = buildBrief({
      items,
      changes: new Map([["wf_refund_review_agent", [promptChange]]]),
      sharedCredentials: [],
      blastById: new Map([
        [
          "wf_refund_review_agent",
          {
            workflowId: "wf_refund_review_agent",
            downstreamWorkflowIds: ["wf_customer_onboarding"],
            advisoryWorkflowIds: [],
            systems: [],
            processGroup: { key: "pg:x", name: "Refund process", workflowIds: ["wf_refund_review_agent"] },
            affectedOwnerTeams: ["RevOps"],
          },
        ],
      ]),
    });
    const change = withBlast.find((b) => b.workflowId === "wf_refund_review_agent" && b.category === "change");
    expect(change!.whyItMatters).toMatch(/Blast radius/);
    expect(change!.whyItMatters).toMatch(/Refund process/);
    expect(change!.whyItMatters).toMatch(/RevOps/);
  });
});
