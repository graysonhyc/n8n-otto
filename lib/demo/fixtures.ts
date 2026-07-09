import type { N8nExecution, N8nWorkflow } from "@/lib/n8n/types";

// Realistic n8n workflow JSON for the anchor scenarios. Shapes match the public API:
// nodes carry `type`, `parameters`, `credentials`; `connections` are keyed by SOURCE
// node name → connection type ("main", "ai_tool", "ai_languageModel") → target arrays.

const SHARED_HUBSPOT = { id: "cred_hubspot_prod", name: "HubSpot production" };

export const refundReviewAgent: N8nWorkflow = {
  id: "wf_refund_review_agent",
  name: "Refund Review Agent",
  active: true,
  tags: [{ name: "production" }, { name: "support" }],
  homeProject: { id: "prj_support", name: "Support Ops" },
  updatedAt: "2026-07-09T13:10:00.000Z",
  nodes: [
    { name: "Zendesk ticket created", type: "n8n-nodes-base.webhook", parameters: { path: "zendesk-refund" } },
    {
      name: "Refund Review Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      parameters: {
        options: {
          systemMessage:
            "Decide whether to approve or reject the refund and draft the customer reply.",
        },
      },
    },
    {
      name: "OpenAI GPT-4.1",
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      parameters: { model: "gpt-4.1" },
    },
    { name: "Zendesk", type: "n8n-nodes-base.zendeskTool", credentials: { zendeskApi: { id: "cred_zendesk", name: "Zendesk" } } },
    { name: "Stripe lookup", type: "n8n-nodes-base.stripeTool", credentials: { stripeApi: { id: "cred_stripe", name: "Stripe" } } },
    { name: "Gmail draft", type: "n8n-nodes-base.gmailTool", credentials: { gmailOAuth2: { id: "cred_gmail", name: "Gmail" } } },
  ],
  connections: {
    "Zendesk ticket created": { main: [[{ node: "Refund Review Agent", type: "main", index: 0 }]] },
    "OpenAI GPT-4.1": { ai_languageModel: [[{ node: "Refund Review Agent", type: "ai_languageModel", index: 0 }]] },
    Zendesk: { ai_tool: [[{ node: "Refund Review Agent", type: "ai_tool", index: 0 }]] },
    "Stripe lookup": { ai_tool: [[{ node: "Refund Review Agent", type: "ai_tool", index: 0 }]] },
    "Gmail draft": { ai_tool: [[{ node: "Refund Review Agent", type: "ai_tool", index: 0 }]] },
  },
};

// Same agent, earlier revision — used for change-detection tests (summarise → decide).
export const refundReviewAgentPrev: N8nWorkflow = {
  ...refundReviewAgent,
  updatedAt: "2026-07-03T09:00:00.000Z",
  nodes: refundReviewAgent.nodes.map((n) =>
    n.name === "Refund Review Agent"
      ? {
          ...n,
          parameters: {
            options: { systemMessage: "Summarise the refund request for a human agent." },
          },
        }
      : n,
  ),
};

export const customerOnboarding: N8nWorkflow = {
  id: "wf_customer_onboarding",
  name: "Customer Onboarding",
  active: true,
  tags: [{ name: "production" }, { name: "revops" }],
  homeProject: { id: "prj_revops", name: "RevOps" },
  updatedAt: "2026-07-03T10:00:00.000Z",
  nodes: [
    { name: "Stripe subscription created", type: "n8n-nodes-base.stripeTrigger", credentials: { stripeApi: { id: "cred_stripe", name: "Stripe" } } },
    { name: "HubSpot update", type: "n8n-nodes-base.hubspot", credentials: { hubspotApi: SHARED_HUBSPOT } },
    { name: "Slack CS alert", type: "n8n-nodes-base.slack", parameters: { channel: "#cs-alerts" }, credentials: { slackApi: { id: "cred_slack", name: "Slack" } } },
    { name: "Welcome email", type: "n8n-nodes-base.executeWorkflow", parameters: { workflowId: "wf_welcome_email_agent" } },
  ],
  connections: {
    "Stripe subscription created": { main: [[{ node: "HubSpot update", type: "main", index: 0 }]] },
    "HubSpot update": { main: [[{ node: "Slack CS alert", type: "main", index: 0 }]] },
    "Slack CS alert": { main: [[{ node: "Welcome email", type: "main", index: 0 }]] },
  },
};

export const welcomeEmailAgent: N8nWorkflow = {
  id: "wf_welcome_email_agent",
  name: "Welcome Email Agent",
  active: true,
  tags: [{ name: "production" }],
  homeProject: { id: "prj_revops", name: "RevOps" },
  updatedAt: "2026-06-20T10:00:00.000Z",
  nodes: [
    { name: "When called", type: "n8n-nodes-base.executeWorkflowTrigger" },
    { name: "Welcome Email Agent", type: "@n8n/n8n-nodes-langchain.agent", parameters: { options: { systemMessage: "Write a warm welcome email." } } },
    { name: "OpenAI GPT-4o", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", parameters: { model: "gpt-4o" } },
    { name: "Send email", type: "n8n-nodes-base.gmail", credentials: { gmailOAuth2: { id: "cred_gmail", name: "Gmail" } } },
  ],
  connections: {
    "When called": { main: [[{ node: "Welcome Email Agent", type: "main", index: 0 }]] },
    "OpenAI GPT-4o": { ai_languageModel: [[{ node: "Welcome Email Agent", type: "ai_languageModel", index: 0 }]] },
    "Welcome Email Agent": { main: [[{ node: "Send email", type: "main", index: 0 }]] },
  },
};

export const leadRouting: N8nWorkflow = {
  id: "wf_lead_routing",
  name: "Lead Routing",
  active: true,
  tags: [{ name: "production" }, { name: "sales" }],
  homeProject: { id: "prj_sales", name: "Sales Ops" },
  updatedAt: "2026-06-18T10:00:00.000Z",
  nodes: [
    { name: "New lead webhook", type: "n8n-nodes-base.webhook", parameters: { path: "new-lead" } },
    { name: "HubSpot lookup", type: "n8n-nodes-base.hubspot", credentials: { hubspotApi: SHARED_HUBSPOT } },
    { name: "Salesforce assign", type: "n8n-nodes-base.salesforce", credentials: { salesforceOAuth2Api: { id: "cred_sf", name: "Salesforce" } } },
  ],
  connections: {
    "New lead webhook": { main: [[{ node: "HubSpot lookup", type: "main", index: 0 }]] },
    "HubSpot lookup": { main: [[{ node: "Salesforce assign", type: "main", index: 0 }]] },
  },
};

export const ptoApprovalBot: N8nWorkflow = {
  id: "wf_pto_approval_bot",
  name: "PTO Approval Bot",
  active: true,
  tags: [{ name: "hr" }],
  homeProject: { id: "prj_people", name: "People Ops" },
  updatedAt: "2026-05-26T10:00:00.000Z",
  nodes: [
    { name: "Leave request form", type: "n8n-nodes-base.formTrigger" },
    { name: "Classify request", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", parameters: { model: "gpt-4o-mini" } },
    { name: "Wait for manager", type: "n8n-nodes-base.wait" },
    { name: "Notion log", type: "n8n-nodes-base.notion", credentials: { notionApi: { id: "cred_notion", name: "Notion" } } },
    { name: "Notify employee", type: "n8n-nodes-base.gmail", credentials: { gmailOAuth2: { id: "cred_gmail", name: "Gmail" } } },
  ],
  connections: {
    "Leave request form": { main: [[{ node: "Classify request", type: "main", index: 0 }]] },
    "Classify request": { main: [[{ node: "Wait for manager", type: "main", index: 0 }]] },
    "Wait for manager": { main: [[{ node: "Notion log", type: "main", index: 0 }]] },
    "Notion log": { main: [[{ node: "Notify employee", type: "main", index: 0 }]] },
  },
};

export const allWorkflows: N8nWorkflow[] = [
  refundReviewAgent,
  customerOnboarding,
  welcomeEmailAgent,
  leadRouting,
  ptoApprovalBot,
];

// A few executions: Refund agent failing repeatedly (health signal), others healthy.
export const executions: N8nExecution[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `ex_refund_${i}`,
    workflowId: "wf_refund_review_agent",
    finished: true,
    status: "error" as const,
    startedAt: `2026-07-09T14:${10 + i}:00.000Z`,
    stoppedAt: `2026-07-09T14:${10 + i}:05.000Z`,
  })),
  {
    id: "ex_onboard_1",
    workflowId: "wf_customer_onboarding",
    finished: true,
    status: "success",
    startedAt: "2026-07-09T12:00:00.000Z",
    stoppedAt: "2026-07-09T12:00:03.000Z",
  },
];
