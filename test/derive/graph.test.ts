import { describe, it, expect } from "vitest";
import { composeDeterministic, composeGraph } from "@/lib/derive/graph";
import {
  contentOrchestrator,
  customerOnboarding,
  formatPost,
  welcomeEmailAgent,
  leadRouting,
  refundReviewAgent,
  syncLinkedin,
  syncYoutube,
  executions,
} from "@/lib/demo/fixtures";
import type { ManualLink } from "@/lib/backoffice/types";

const workflows = [customerOnboarding, welcomeEmailAgent, leadRouting, refundReviewAgent];

function baseInput(links: ManualLink[] = []) {
  return {
    workflows,
    executions,
    owners: new Map(),
    links,
    groupNames: new Map<string, string>(),
    now: Date.parse("2026-07-09T15:00:00.000Z"),
  };
}

const link = (fromId: string, toId: string): ManualLink => ({
  id: `${fromId}-${toId}`,
  fromId,
  toId,
  relation: "part-of-process",
  source: "manual",
});

describe("composeGraph", () => {
  it("emits a workflow node per workflow carrying type/risk/owner", () => {
    const g = composeGraph(baseInput());
    const wf = g.nodes.filter((n) => n.kind === "workflow");
    expect(wf.map((n) => n.id).sort()).toEqual(
      ["wf_customer_onboarding", "wf_lead_routing", "wf_refund_review_agent", "wf_welcome_email_agent"],
    );
    const refund = wf.find((n) => n.id === "wf_refund_review_agent");
    expect(refund && "risk" in refund && ["high", "medium", "low"]).toBeTruthy();
  });

  it("emits a calls edge from Execute Workflow targets (tier A)", () => {
    const g = composeGraph(baseInput());
    expect(
      g.edges.some(
        (e) =>
          e.kind === "calls" &&
          e.source === "wf_customer_onboarding" &&
          e.target === "wf_welcome_email_agent",
      ),
    ).toBe(true);
  });

  it("emits one shared-credential edge per pair (tier A)", () => {
    const g = composeGraph(baseInput());
    const shared = g.edges.filter(
      (e) =>
        e.kind === "shares-credential" &&
        [e.source, e.target].sort().join() ===
          ["wf_customer_onboarding", "wf_lead_routing"].sort().join(),
    );
    expect(shared).toHaveLength(1);
  });

  it("emits deduped system nodes + uses-system edges (tier B)", () => {
    const g = composeGraph(baseInput());
    const systems = g.nodes.filter((n) => n.kind === "system");
    const names = systems.map((n) => n.name);
    expect(new Set(names).size).toEqual(names.length); // no duplicate system nodes
    expect(g.edges.some((e) => e.kind === "uses-system")).toBe(true);
    // every uses-system edge targets an existing system node
    const systemIds = new Set(systems.map((n) => n.id));
    for (const e of g.edges.filter((e) => e.kind === "uses-system")) {
      expect(systemIds.has(e.target)).toBe(true);
    }
  });

  it("emits manual edges (tier M) and assigns groupKey to grouped workflows", () => {
    const g = composeGraph(baseInput([link("wf_customer_onboarding", "wf_welcome_email_agent")]));
    expect(g.groups).toHaveLength(1);
    expect(g.edges.some((e) => e.kind === "manual" && e.tier === "M")).toBe(true);
    const co = g.nodes.find((n) => n.id === "wf_customer_onboarding");
    expect(co && co.kind === "workflow" && co.groupKey).toEqual(g.groups[0].key);
  });

  it("skips call edges whose target workflow is not in the set", () => {
    const g = composeGraph({ ...baseInput(), workflows: [customerOnboarding] });
    // welcome_email_agent absent → the calls edge must be dropped
    expect(g.edges.some((e) => e.kind === "calls")).toBe(false);
  });
});

describe("composeDeterministic", () => {
  const pipeline = [formatPost, syncYoutube, syncLinkedin, contentOrchestrator, customerOnboarding, welcomeEmailAgent];
  const detInput = (layers: { dataSources: boolean; credentials: boolean }) => ({
    workflows: pipeline,
    executions,
    owners: new Map(),
    now: Date.parse("2026-07-09T15:00:00.000Z"),
    layers,
  });

  it("default (no layers) = dependency skeleton only, no hub nodes", () => {
    const g = composeDeterministic(detInput({ dataSources: false, credentials: false }));
    expect(g.nodes.every((n) => n.kind === "workflow")).toBe(true);
    expect(g.edges.every((e) => e.kind === "calls" || e.kind === "subworkflow-tool")).toBe(true);
    // subworkflow-as-tool: content orchestrator → format post
    expect(g.edges.some((e) => e.kind === "subworkflow-tool" && e.source === "wf_content_orchestrator" && e.target === "wf_format_post")).toBe(true);
    // plain call: customer onboarding → welcome email
    expect(g.edges.some((e) => e.kind === "calls" && e.source === "wf_customer_onboarding" && e.target === "wf_welcome_email_agent")).toBe(true);
  });

  it("data-source layer adds resource hubs, never pairwise credential edges", () => {
    const g = composeDeterministic(detInput({ dataSources: true, credentials: false }));
    const hub = g.nodes.find((n) => n.kind === "resource" && n.name === "sheet_content_calendar");
    expect(hub).toBeDefined();
    // both syncers spoke into the one hub
    const spokes = g.edges.filter((e) => e.kind === "uses-resource" && e.target === hub!.id);
    expect(spokes.map((e) => e.source).sort()).toEqual(["wf_sync_linkedin", "wf_sync_youtube"]);
    expect(g.edges.some((e) => e.kind === "shares-credential")).toBe(false);
  });

  it("credential layer adds credential hubs", () => {
    const g = composeDeterministic(detInput({ dataSources: false, credentials: true }));
    expect(g.nodes.some((n) => n.kind === "credential")).toBe(true);
    // every uses-credential spoke targets an existing credential hub
    const credIds = new Set(g.nodes.filter((n) => n.kind === "credential").map((n) => n.id));
    for (const e of g.edges.filter((e) => e.kind === "uses-credential")) {
      expect(credIds.has(e.target)).toBe(true);
    }
  });

  it("skips subworkflow-tool edges whose target is absent from the set", () => {
    const g = composeDeterministic({ ...detInput({ dataSources: false, credentials: false }), workflows: [contentOrchestrator] });
    expect(g.edges.some((e) => e.kind === "subworkflow-tool")).toBe(false);
  });
});
