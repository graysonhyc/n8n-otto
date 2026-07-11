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
    // Once the agent approves, it hands off to the Refund Execution sub-workflow
    // to actually move the money — an executeWorkflow CALL edge, so the two form
    // one auto-detected "Refund SOP" whose head step (this agent) is failing.
    { name: "Execute refund", type: "n8n-nodes-base.executeWorkflow", parameters: { workflowId: "wf_refund_execution" } },
  ],
  connections: {
    "Zendesk ticket created": { main: [[{ node: "Refund Review Agent", type: "main", index: 0 }]] },
    "OpenAI GPT-4.1": { ai_languageModel: [[{ node: "Refund Review Agent", type: "ai_languageModel", index: 0 }]] },
    Zendesk: { ai_tool: [[{ node: "Refund Review Agent", type: "ai_tool", index: 0 }]] },
    "Stripe lookup": { ai_tool: [[{ node: "Refund Review Agent", type: "ai_tool", index: 0 }]] },
    "Gmail draft": { ai_tool: [[{ node: "Refund Review Agent", type: "ai_tool", index: 0 }]] },
    "Refund Review Agent": { main: [[{ node: "Execute refund", type: "main", index: 0 }]] },
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
  settings: { timeSavedPerExecution: 12 },
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

// Scheduled AI agent — the "runs today" anchor. Fires daily on a schedule
// trigger, so it shows up in the brief's look-ahead. Owner set time saved.
export const revenueReportAgent: N8nWorkflow = {
  id: "wf_revenue_report_agent",
  name: "Revenue Report Agent",
  active: true,
  tags: [{ name: "production" }, { name: "finance" }],
  homeProject: { id: "prj_finance", name: "Finance" },
  updatedAt: "2026-06-30T10:00:00.000Z",
  settings: { timeSavedPerExecution: 30 },
  nodes: [
    { name: "Every day 08:00", type: "n8n-nodes-base.scheduleTrigger", parameters: { rule: { interval: [{ field: "days" }] } } },
    { name: "Revenue Report Agent", type: "@n8n/n8n-nodes-langchain.agent", parameters: { options: { systemMessage: "Summarise yesterday's revenue and post to Slack." } } },
    { name: "OpenAI GPT-4o", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", parameters: { model: "gpt-4o" } },
    { name: "BigQuery", type: "n8n-nodes-base.googleBigQueryTool", credentials: { googleBigQueryOAuth2Api: { id: "cred_bq", name: "BigQuery" } } },
    { name: "Slack post", type: "n8n-nodes-base.slack", parameters: { channel: "#finance" }, credentials: { slackApi: { id: "cred_slack", name: "Slack" } } },
  ],
  connections: {
    "Every day 08:00": { main: [[{ node: "Revenue Report Agent", type: "main", index: 0 }]] },
    "OpenAI GPT-4o": { ai_languageModel: [[{ node: "Revenue Report Agent", type: "ai_languageModel", index: 0 }]] },
    BigQuery: { ai_tool: [[{ node: "Revenue Report Agent", type: "ai_tool", index: 0 }]] },
    "Revenue Report Agent": { main: [[{ node: "Slack post", type: "main", index: 0 }]] },
  },
};

// ---- Content pipeline: shared-data-source + subworkflow-as-tool anchors ------
// "Sync YouTube" and "Sync LinkedIn" are related because they read/write the
// SAME Google Sheet (the content calendar) — a deterministic shared-data-source
// hub. "Content Orchestrator" (an agent) uses "Format Post" as a subworkflow
// tool — a deterministic subworkflow-as-tool dependency.

export const formatPost: N8nWorkflow = {
  id: "wf_format_post",
  name: "Format Post",
  active: true,
  tags: [{ name: "production" }, { name: "marketing" }],
  homeProject: { id: "prj_marketing", name: "Marketing" },
  updatedAt: "2026-06-15T10:00:00.000Z",
  nodes: [
    { name: "When called", type: "n8n-nodes-base.executeWorkflowTrigger" },
    { name: "Format", type: "n8n-nodes-base.set", parameters: {} },
  ],
  connections: {
    "When called": { main: [[{ node: "Format", type: "main", index: 0 }]] },
  },
};

export const syncYoutube: N8nWorkflow = {
  id: "wf_sync_youtube",
  name: "Sync YouTube",
  active: true,
  tags: [{ name: "production" }, { name: "marketing" }],
  homeProject: { id: "prj_marketing", name: "Marketing" },
  updatedAt: "2026-07-01T10:00:00.000Z",
  nodes: [
    { name: "Every hour", type: "n8n-nodes-base.scheduleTrigger", parameters: { rule: { interval: [{ field: "hours" }] } } },
    { name: "Content calendar", type: "n8n-nodes-base.googleSheets", parameters: { documentId: "sheet_content_calendar", sheetName: "Calendar" }, credentials: { googleSheetsOAuth2Api: { id: "cred_gsheets", name: "Google Sheets" } } },
  ],
  connections: {
    "Every hour": { main: [[{ node: "Content calendar", type: "main", index: 0 }]] },
  },
};

export const syncLinkedin: N8nWorkflow = {
  id: "wf_sync_linkedin",
  name: "Sync LinkedIn",
  active: true,
  tags: [{ name: "production" }, { name: "marketing" }],
  homeProject: { id: "prj_marketing", name: "Marketing" },
  updatedAt: "2026-07-01T11:00:00.000Z",
  nodes: [
    { name: "Every hour", type: "n8n-nodes-base.scheduleTrigger", parameters: { rule: { interval: [{ field: "hours" }] } } },
    { name: "Content calendar", type: "n8n-nodes-base.googleSheets", parameters: { documentId: "sheet_content_calendar", sheetName: "Calendar" }, credentials: { googleSheetsOAuth2Api: { id: "cred_gsheets", name: "Google Sheets" } } },
  ],
  connections: {
    "Every hour": { main: [[{ node: "Content calendar", type: "main", index: 0 }]] },
  },
};

export const contentOrchestrator: N8nWorkflow = {
  id: "wf_content_orchestrator",
  name: "Content Orchestrator",
  active: true,
  tags: [{ name: "production" }, { name: "marketing" }],
  homeProject: { id: "prj_marketing", name: "Marketing" },
  updatedAt: "2026-07-02T10:00:00.000Z",
  nodes: [
    { name: "Chat", type: "@n8n/n8n-nodes-langchain.chatTrigger" },
    { name: "Content Orchestrator", type: "@n8n/n8n-nodes-langchain.agent", parameters: { options: { systemMessage: "Draft and schedule cross-platform posts." } } },
    { name: "OpenAI GPT-4o", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", parameters: { model: "gpt-4o" } },
    { name: "Format Post", type: "@n8n/n8n-nodes-langchain.toolWorkflow", parameters: { workflowId: { value: "wf_format_post" } } },
  ],
  connections: {
    Chat: { main: [[{ node: "Content Orchestrator", type: "main", index: 0 }]] },
    "OpenAI GPT-4o": { ai_languageModel: [[{ node: "Content Orchestrator", type: "ai_languageModel", index: 0 }]] },
    "Format Post": { ai_tool: [[{ node: "Content Orchestrator", type: "ai_tool", index: 0 }]] },
  },
};

// ---- Billing / AR team (#billing-ops) --------------------------------------
// The Refund SOP's downstream half. `Refund Execution` is the sub-workflow the
// Refund Review Agent calls (executeWorkflow), so agent → execution is one
// process. Both touch Stripe (shared credential → blast radius). Dunning Retry
// is a sibling billing job that also shares the Stripe credential.

const SHARED_JIRA = { id: "cred_jira", name: "Jira" };

export const refundExecution: N8nWorkflow = {
  id: "wf_refund_execution",
  name: "Refund Execution",
  active: true,
  tags: [{ name: "production" }, { name: "billing" }],
  homeProject: { id: "prj_billing", name: "Billing Ops" },
  updatedAt: "2026-07-08T10:00:00.000Z",
  settings: { timeSavedPerExecution: 8 },
  nodes: [
    { name: "When called", type: "n8n-nodes-base.executeWorkflowTrigger" },
    { name: "Issue Stripe refund", type: "n8n-nodes-base.stripe", credentials: { stripeApi: { id: "cred_stripe", name: "Stripe" } } },
    { name: "HubSpot refund note", type: "n8n-nodes-base.hubspot", credentials: { hubspotApi: SHARED_HUBSPOT } },
  ],
  connections: {
    "When called": { main: [[{ node: "Issue Stripe refund", type: "main", index: 0 }]] },
    "Issue Stripe refund": { main: [[{ node: "HubSpot refund note", type: "main", index: 0 }]] },
  },
};

export const dunningRetry: N8nWorkflow = {
  id: "wf_dunning_retry",
  name: "Dunning Retry",
  active: true,
  tags: [{ name: "production" }, { name: "billing" }],
  homeProject: { id: "prj_billing", name: "Billing Ops" },
  updatedAt: "2026-07-05T10:00:00.000Z",
  settings: { timeSavedPerExecution: 5 },
  nodes: [
    { name: "Every day 07:00", type: "n8n-nodes-base.scheduleTrigger", parameters: { rule: { interval: [{ field: "days" }] } } },
    { name: "Retry failed charges", type: "n8n-nodes-base.stripe", credentials: { stripeApi: { id: "cred_stripe", name: "Stripe" } } },
    { name: "Post to billing", type: "n8n-nodes-base.slack", parameters: { channel: "#billing-ops" }, credentials: { slackApi: { id: "cred_slack", name: "Slack" } } },
  ],
  connections: {
    "Every day 07:00": { main: [[{ node: "Retry failed charges", type: "main", index: 0 }]] },
    "Retry failed charges": { main: [[{ node: "Post to billing", type: "main", index: 0 }]] },
  },
};

// ---- Customer Success team (#cs-ops) ---------------------------------------
// Churn Risk Agent + Health Score Sync both read HubSpot (grows the HubSpot
// credential blast radius). NPS Follow-up shares Gmail + Notion with other teams.

export const churnRiskAgent: N8nWorkflow = {
  id: "wf_churn_risk_agent",
  name: "Churn Risk Agent",
  active: true,
  tags: [{ name: "production" }, { name: "cs" }],
  homeProject: { id: "prj_cs", name: "Customer Success" },
  updatedAt: "2026-07-06T10:00:00.000Z",
  settings: { timeSavedPerExecution: 20 },
  nodes: [
    { name: "Every day 06:00", type: "n8n-nodes-base.scheduleTrigger", parameters: { rule: { interval: [{ field: "days" }] } } },
    { name: "Churn Risk Agent", type: "@n8n/n8n-nodes-langchain.agent", parameters: { options: { systemMessage: "Score accounts for churn risk and draft save-play outreach." } } },
    { name: "OpenAI GPT-4o", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", parameters: { model: "gpt-4o" } },
    { name: "HubSpot", type: "n8n-nodes-base.hubspotTool", credentials: { hubspotApi: SHARED_HUBSPOT } },
    { name: "Post to CS", type: "n8n-nodes-base.slack", parameters: { channel: "#cs-ops" }, credentials: { slackApi: { id: "cred_slack", name: "Slack" } } },
  ],
  connections: {
    "Every day 06:00": { main: [[{ node: "Churn Risk Agent", type: "main", index: 0 }]] },
    "OpenAI GPT-4o": { ai_languageModel: [[{ node: "Churn Risk Agent", type: "ai_languageModel", index: 0 }]] },
    HubSpot: { ai_tool: [[{ node: "Churn Risk Agent", type: "ai_tool", index: 0 }]] },
    "Churn Risk Agent": { main: [[{ node: "Post to CS", type: "main", index: 0 }]] },
  },
};

export const npsFollowup: N8nWorkflow = {
  id: "wf_nps_followup",
  name: "NPS Follow-up",
  active: true,
  tags: [{ name: "production" }, { name: "cs" }],
  homeProject: { id: "prj_cs", name: "Customer Success" },
  updatedAt: "2026-06-28T10:00:00.000Z",
  settings: { timeSavedPerExecution: 4 },
  nodes: [
    { name: "Survey response", type: "n8n-nodes-base.webhook", parameters: { path: "nps" } },
    { name: "Score branch", type: "n8n-nodes-base.if" },
    { name: "Send follow-up", type: "n8n-nodes-base.gmail", credentials: { gmailOAuth2: { id: "cred_gmail", name: "Gmail" } } },
    { name: "Notion log", type: "n8n-nodes-base.notion", credentials: { notionApi: { id: "cred_notion", name: "Notion" } } },
  ],
  connections: {
    "Survey response": { main: [[{ node: "Score branch", type: "main", index: 0 }]] },
    "Score branch": { main: [[{ node: "Send follow-up", type: "main", index: 0 }]] },
    "Send follow-up": { main: [[{ node: "Notion log", type: "main", index: 0 }]] },
  },
};

export const healthScoreSync: N8nWorkflow = {
  id: "wf_health_score_sync",
  name: "Health Score Sync",
  active: true,
  tags: [{ name: "production" }, { name: "cs" }],
  homeProject: { id: "prj_cs", name: "Customer Success" },
  updatedAt: "2026-06-25T10:00:00.000Z",
  nodes: [
    { name: "Every hour", type: "n8n-nodes-base.scheduleTrigger", parameters: { rule: { interval: [{ field: "hours" }] } } },
    { name: "HubSpot read", type: "n8n-nodes-base.hubspot", credentials: { hubspotApi: SHARED_HUBSPOT } },
    { name: "CS health sheet", type: "n8n-nodes-base.googleSheets", parameters: { documentId: "sheet_cs_health", sheetName: "Scores" }, credentials: { googleSheetsOAuth2Api: { id: "cred_gsheets", name: "Google Sheets" } } },
  ],
  connections: {
    "Every hour": { main: [[{ node: "HubSpot read", type: "main", index: 0 }]] },
    "HubSpot read": { main: [[{ node: "CS health sheet", type: "main", index: 0 }]] },
  },
};

// ---- IT & Security team (#it-ops) ------------------------------------------
// Employee Offboarding CALLS Access Provisioning (executeWorkflow) → one auto
// "IT SOP". Access Provisioning + Incident Triage share the Jira credential.
// Incident Triage is the second failing workflow (routes to a DIFFERENT owner
// channel than the Refund failure — demonstrates per-team routing).

export const accessProvisioning: N8nWorkflow = {
  id: "wf_access_provisioning",
  name: "Access Provisioning",
  active: true,
  tags: [{ name: "production" }, { name: "it" }],
  homeProject: { id: "prj_it", name: "IT & Security" },
  updatedAt: "2026-07-04T10:00:00.000Z",
  settings: { timeSavedPerExecution: 15 },
  nodes: [
    { name: "When called", type: "n8n-nodes-base.executeWorkflowTrigger" },
    { name: "Okta provision", type: "n8n-nodes-base.httpRequest", parameters: { url: "https://acme.okta.com/api/v1/users" } },
    { name: "Jira access ticket", type: "n8n-nodes-base.jira", credentials: { jiraSoftwareCloudApi: SHARED_JIRA } },
    { name: "Notify IT", type: "n8n-nodes-base.slack", parameters: { channel: "#it-ops" }, credentials: { slackApi: { id: "cred_slack", name: "Slack" } } },
  ],
  connections: {
    "When called": { main: [[{ node: "Okta provision", type: "main", index: 0 }]] },
    "Okta provision": { main: [[{ node: "Jira access ticket", type: "main", index: 0 }]] },
    "Jira access ticket": { main: [[{ node: "Notify IT", type: "main", index: 0 }]] },
  },
};

export const incidentTriageAgent: N8nWorkflow = {
  id: "wf_incident_triage_agent",
  name: "Incident Triage Agent",
  active: true,
  tags: [{ name: "production" }, { name: "it" }],
  homeProject: { id: "prj_it", name: "IT & Security" },
  updatedAt: "2026-07-07T10:00:00.000Z",
  nodes: [
    { name: "PagerDuty alert", type: "n8n-nodes-base.webhook", parameters: { path: "pagerduty" } },
    { name: "Incident Triage Agent", type: "@n8n/n8n-nodes-langchain.agent", parameters: { options: { systemMessage: "Triage the incident, summarise blast radius, and open a ticket." } } },
    { name: "OpenAI GPT-4o", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", parameters: { model: "gpt-4o" } },
    { name: "Jira", type: "n8n-nodes-base.jiraTool", credentials: { jiraSoftwareCloudApi: SHARED_JIRA } },
    { name: "Slack IT", type: "n8n-nodes-base.slackTool", parameters: { channel: "#it-ops" }, credentials: { slackApi: { id: "cred_slack", name: "Slack" } } },
  ],
  connections: {
    "PagerDuty alert": { main: [[{ node: "Incident Triage Agent", type: "main", index: 0 }]] },
    "OpenAI GPT-4o": { ai_languageModel: [[{ node: "Incident Triage Agent", type: "ai_languageModel", index: 0 }]] },
    Jira: { ai_tool: [[{ node: "Incident Triage Agent", type: "ai_tool", index: 0 }]] },
    "Slack IT": { ai_tool: [[{ node: "Incident Triage Agent", type: "ai_tool", index: 0 }]] },
  },
};

export const employeeOffboarding: N8nWorkflow = {
  id: "wf_employee_offboarding",
  name: "Employee Offboarding",
  active: true,
  tags: [{ name: "production" }, { name: "it" }, { name: "hr" }],
  homeProject: { id: "prj_it", name: "IT & Security" },
  updatedAt: "2026-07-02T10:00:00.000Z",
  settings: { timeSavedPerExecution: 25 },
  nodes: [
    { name: "Offboarding request", type: "n8n-nodes-base.formTrigger" },
    { name: "Revoke access", type: "n8n-nodes-base.executeWorkflow", parameters: { workflowId: "wf_access_provisioning" } },
    { name: "Notion log", type: "n8n-nodes-base.notion", credentials: { notionApi: { id: "cred_notion", name: "Notion" } } },
  ],
  connections: {
    "Offboarding request": { main: [[{ node: "Revoke access", type: "main", index: 0 }]] },
    "Revoke access": { main: [[{ node: "Notion log", type: "main", index: 0 }]] },
  },
};

export const allWorkflows: N8nWorkflow[] = [
  refundReviewAgent,
  customerOnboarding,
  welcomeEmailAgent,
  leadRouting,
  ptoApprovalBot,
  revenueReportAgent,
  formatPost,
  syncYoutube,
  syncLinkedin,
  contentOrchestrator,
  // Billing / AR
  refundExecution,
  dunningRetry,
  // Customer Success
  churnRiskAgent,
  npsFollowup,
  healthScoreSync,
  // IT & Security
  accessProvisioning,
  incidentTriageAgent,
  employeeOffboarding,
];

// Builds N successful executions for a workflow on 2026-07-09, spaced through the
// day, each lasting `durationSec`. Used to give the daily brief realistic volume.
function successRuns(
  workflowId: string,
  count: number,
  durationSec: number,
  startHour = 6,
): N8nExecution[] {
  return Array.from({ length: count }, (_, i) => {
    const min = (i * 7) % 50;
    const hh = String(startHour + Math.floor((i * 7) / 50)).padStart(2, "0");
    const mm = String(min).padStart(2, "0");
    const ss = String(durationSec % 60).padStart(2, "0");
    return {
      id: `ex_${workflowId}_${i}`,
      workflowId,
      finished: true,
      status: "success" as const,
      startedAt: `2026-07-09T${hh}:${mm}:00.000Z`,
      stoppedAt: `2026-07-09T${hh}:${mm}:${ss}.000Z`,
    };
  });
}

// Yesterday's activity (2026-07-09): Refund agent failing repeatedly (health
// signal), everything else running healthily with varied volume and duration.
export const executions: N8nExecution[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `ex_refund_${i}`,
    workflowId: "wf_refund_review_agent",
    finished: true,
    status: "error" as const,
    startedAt: `2026-07-09T14:${10 + i}:00.000Z`,
    stoppedAt: `2026-07-09T14:${10 + i}:05.000Z`,
  })),
  ...successRuns("wf_customer_onboarding", 18, 4),
  ...successRuns("wf_lead_routing", 42, 2),
  ...successRuns("wf_welcome_email_agent", 16, 6),
  ...successRuns("wf_pto_approval_bot", 5, 45),
  ...successRuns("wf_revenue_report_agent", 1, 38),
  // New teams — healthy volume, except Incident Triage which is the SECOND
  // failing workflow (owned by a different team → routes to #it-ops, not
  // #support-ops; demonstrates per-owner routing of live failures).
  ...successRuns("wf_refund_execution", 5, 3, 7),
  ...successRuns("wf_dunning_retry", 3, 20, 7),
  ...successRuns("wf_churn_risk_agent", 1, 40, 6),
  ...successRuns("wf_nps_followup", 9, 3, 8),
  ...successRuns("wf_health_score_sync", 11, 2, 6),
  ...successRuns("wf_access_provisioning", 4, 8, 9),
  ...successRuns("wf_employee_offboarding", 2, 30, 10),
  ...successRuns("wf_incident_triage_agent", 4, 12, 11),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `ex_incident_${i}`,
    workflowId: "wf_incident_triage_agent",
    finished: true,
    status: "error" as const,
    startedAt: `2026-07-09T16:${20 + i}:00.000Z`,
    stoppedAt: `2026-07-09T16:${20 + i}:04.000Z`,
  })),
];
