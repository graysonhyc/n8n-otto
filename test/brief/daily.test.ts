import { describe, expect, it } from "vitest";
import { computeDailyBrief, computeYesterday } from "@/lib/brief/daily";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/lib/demo/fixtures";

// 9am CEST on 2026-07-10 → "yesterday" is the full 2026-07-09 (UTC+2) day,
// which is when every fixture execution is dated.
const NOW = Date.parse("2026-07-10T09:00:00+02:00");
const items = composeRegistry({ workflows: allWorkflows, executions, owners: new Map(), now: NOW });

describe("computeYesterday", () => {
  const y = computeYesterday(items, executions, NOW);

  it("counts every production run from yesterday", () => {
    // 6 refund errors + 18 + 42 + 16 + 5 + 1 successes
    expect(y.runs).toBe(88);
    expect(y.errors).toBe(6);
    expect(y.tasksSolved).toBe(82);
  });

  it("reports an error percentage", () => {
    expect(y.errorPct).toBeGreaterThan(5);
    expect(y.errorPct).toBeLessThan(10);
  });

  it("estimates time saved, flagging when defaults were used", () => {
    // onboarding 18*12 + lead 42*3 + welcome 16*8 + pto 5*10 + revenue 1*30
    expect(y.timeSavedMinutes).toBe(550);
    expect(y.timeSavedEstimated).toBe(true);
  });

  it("ranks top runners and error sources", () => {
    expect(y.topRunners[0].id).toBe("wf_lead_routing");
    expect(y.topErrorSources[0].id).toBe("wf_refund_review_agent");
  });

  it("labels the day it covers", () => {
    expect(y.dateLabel).toMatch(/9 Jul/);
  });

  it("excludes manual-only workflows and days other than yesterday", () => {
    const older = [
      ...executions,
      { id: "old", workflowId: "wf_lead_routing", finished: true, status: "success" as const, startedAt: "2026-07-01T10:00:00.000Z", stoppedAt: "2026-07-01T10:00:02.000Z" },
    ];
    expect(computeYesterday(items, older, NOW).runs).toBe(88);
  });
});

describe("computeDailyBrief", () => {
  const brief = computeDailyBrief({
    items,
    executions,
    changes: new Map(),
    attention: [],
    sharedCredentials: [
      { credentialId: "cred_hubspot_prod", credentialName: "HubSpot production", workflowIds: ["wf_customer_onboarding", "wf_lead_routing", "wf_pto_approval_bot"] },
    ],
    now: NOW,
  });

  it("lists scheduled workflows under today", () => {
    expect(brief.today.scheduled.some((s) => s.id === "wf_revenue_report_agent")).toBe(true);
  });

  it("surfaces forward-looking opportunities to explore", () => {
    expect(brief.exploreNext.length).toBeGreaterThan(0);
    // The native time-saved config gap should be one of them.
    expect(brief.exploreNext.some((e) => /time saved/i.test(e.title))).toBe(true);
  });
});
