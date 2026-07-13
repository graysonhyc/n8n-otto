import { describe, expect, it } from "vitest";
import {
  agentToolEdges,
  sharedCredentialEdges,
  sharedDataSourceGroups,
  subworkflowToolEdges,
  systemEdges,
  webhookHandoffEdges,
  workflowCallEdges,
} from "@/lib/derive/edges";
import type { N8nWorkflow } from "@/lib/n8n/types";
import {
  allWorkflows,
  contentOrchestrator,
  customerOnboarding,
  leadRouting,
  refundReviewAgent,
} from "@/lib/demo/fixtures";

describe("edge extraction", () => {
  it("Tier A: workflow → workflow from Execute Workflow nodes", () => {
    const edges = workflowCallEdges(customerOnboarding);
    expect(edges).toContainEqual({
      from: "wf_customer_onboarding",
      to: "wf_welcome_email_agent",
      kind: "calls",
      tier: "A",
    });
  });

  it("Tier A: agent → tool from ai_tool connections", () => {
    const edges = agentToolEdges(refundReviewAgent);
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => e.to).sort()).toEqual([
      "Gmail draft",
      "Stripe lookup",
      "Zendesk",
    ]);
    expect(edges.every((e) => e.tier === "A" && e.kind === "agent-tool")).toBe(true);
  });

  it("Tier A: shared-credential edge between two workflows", () => {
    const edges = sharedCredentialEdges([customerOnboarding, leadRouting]);
    const shared = edges.find((e) => e.credentialId === "cred_hubspot_prod");
    expect(shared).toBeDefined();
    expect([shared!.from, shared!.to].sort()).toEqual([
      "wf_customer_onboarding",
      "wf_lead_routing",
    ]);
    expect(shared!.tier).toBe("A");
  });

  it("Tier A: subworkflow-as-tool from a toolWorkflow wired into an agent", () => {
    const edges = subworkflowToolEdges(contentOrchestrator);
    expect(edges).toContainEqual({
      from: "wf_content_orchestrator",
      to: "wf_format_post",
      kind: "subworkflow-tool",
      tier: "A",
    });
  });

  it("no subworkflow-tool edges when there is no agent", () => {
    expect(subworkflowToolEdges(customerOnboarding)).toEqual([]);
  });

  it("groups workflows that touch the same resource id into one hub", () => {
    const groups = sharedDataSourceGroups(allWorkflows);
    const sheet = groups.find((g) => g.resource === "sheet_content_calendar");
    expect(sheet).toBeDefined();
    expect(sheet!.system).toBe("Google Sheets");
    expect(sheet!.workflowIds).toEqual(["wf_sync_linkedin", "wf_sync_youtube"]);
  });

  it("does not group a resource touched by only one workflow", () => {
    const groups = sharedDataSourceGroups(allWorkflows);
    // "#finance" is used solely by the revenue report agent → no hub.
    expect(groups.find((g) => g.resource === "#finance")).toBeUndefined();
  });

  it("Tier B: workflow → system resource (Slack channel)", () => {
    const edges = systemEdges(customerOnboarding);
    const slack = edges.find((e) => e.system === "Slack");
    expect(slack).toBeDefined();
    expect(slack!.resource).toBe("#cs-alerts");
    expect(slack!.tier).toBe("B");
  });

  it("unwraps a resource-locator documentId so shared Google Sheets group", () => {
    // n8n stores the sheet id as { __rl, value } — not a plain string.
    const sheetNode = (name: string) => ({
      name,
      type: "n8n-nodes-base.googleSheets",
      parameters: { documentId: { __rl: true, mode: "list", value: "SHEET_ABC" } },
    });
    const mk = (id: string) => ({
      id,
      name: id,
      active: true,
      nodes: [sheetNode("gs")],
      connections: {},
    });
    const groups = sharedDataSourceGroups([mk("a"), mk("b")]);
    const sheet = groups.find((g) => g.resource === "SHEET_ABC");
    expect(sheet).toBeDefined();
    expect(sheet!.system).toBe("Google Sheets");
    expect(sheet!.workflowIds).toEqual(["a", "b"]);
  });
});

describe("webhookHandoffEdges", () => {
  const triggerWf = (id: string, path: string): N8nWorkflow =>
    ({
      id,
      name: id,
      active: true,
      nodes: [{ name: "hook", type: "n8n-nodes-base.webhook", parameters: { path } }],
      connections: {},
    }) as unknown as N8nWorkflow;

  const callerWf = (id: string, url: string): N8nWorkflow =>
    ({
      id,
      name: id,
      active: true,
      nodes: [{ name: "http", type: "n8n-nodes-base.httpRequest", parameters: { url } }],
      connections: {},
    }) as unknown as N8nWorkflow;

  it("links a workflow whose HTTP target hits another's webhook path", () => {
    const wfs = [
      callerWf("a", "https://n8n.example.com/webhook/zendesk-refund"),
      triggerWf("b", "zendesk-refund"),
    ];
    const edges = webhookHandoffEdges(wfs);
    expect(edges).toEqual([{ from: "a", to: "b", kind: "webhook-handoff", tier: "A" }]);
  });

  it("emits nothing when no HTTP target matches a trigger path", () => {
    const wfs = [callerWf("a", "https://api.stripe.com/charges"), triggerWf("b", "zendesk-refund")];
    expect(webhookHandoffEdges(wfs)).toEqual([]);
  });

  it("does not link a workflow to its own trigger", () => {
    const self = {
      id: "a",
      name: "a",
      active: true,
      nodes: [
        { name: "hook", type: "n8n-nodes-base.webhook", parameters: { path: "loop" } },
        { name: "http", type: "n8n-nodes-base.httpRequest", parameters: { url: "http://x/webhook/loop" } },
      ],
      connections: {},
    } as unknown as N8nWorkflow;
    expect(webhookHandoffEdges([self])).toEqual([]);
  });
});
