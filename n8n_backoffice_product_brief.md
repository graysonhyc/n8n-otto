# n8n Backoffice Product Brief

## Product Working Name

# n8n Backoffice

**Tagline:** The operational control room for enterprise automations and AI agents.

**Core thesis:** n8n already helps users build workflows and monitor execution metrics. As enterprise workspaces grow, teams also need a backoffice layer that explains what workflows and AI agents mean, who owns them, how they relate, what changed, and what action should happen next.

**Positioning:** This should feel like a native n8n Enterprise module, not a generic external dashboard. The core experience lives inside n8n, with proactive surfaces in Slack, Teams, Jira, Linear, or PagerDuty.

---

# 1. Problems

## Problem framing

Enterprise users often have many automations and AI agents running across teams, but they lack a clear operational understanding of the automation estate.

The problem is not only execution health. n8n already has Insights for production executions, failure rate, runtime, and time saved. The missing layer is:

- What does this workflow or agent actually do?
- Why does it exist?
- Who owns it?
- Who approves changes?
- What business process does it support?
- What systems, prompts, tools, and data does it touch?
- What depends on it?
- What changed before it broke?
- What should happen next?

## Three pain pillars

## Pillar 1: Visibility

**Core question:** What is actually running, and what does it do?

### Runtime visibility pain points

- Users only know something ran by checking the executions tab.
- Users are not sure which workflows are triggered or failing in real time unless they check executions manually.
- Users are not sure which workflows or AI agents failed repeatedly.
- Users are not sure which workflow skipped important steps silently.

### Inventory visibility pain points

- Users do not know which workflows are critical and which are experiments.
- Users are not sure which workflows are active, stale, duplicated, or abandoned.
- Old workflows may still have access to production systems even if nobody remembers them.

### Purpose visibility pain points

- Users do not know the business purpose of each workflow or AI agent.
- Users do not know the expected input and output of the workflow or agent.
- Users are not sure about the logic of the workflow or agent.
- Workflow names and node graphs are often implementation-focused rather than business-focused.

### Trigger visibility pain points

- Users do not know what caused the workflow to run.
- Users are unsure whether the trigger was scheduled, webhook-based, manual, form-based, chat-based, or triggered by another workflow.
- Users do not know when a scheduled workflow is expected to run next.

### AI behaviour visibility pain points

- Users do not know which workflows contain LLM nodes or AI agents.
- Users do not know which workflows are deterministic and which are agentic.
- Users do not know what prompts, models, tools, credentials, or actions an AI agent can access.
- Users do not know whether an AI agent is summarising, recommending, deciding, or taking action.
- Users do not know whether an AI output is reviewed by a human.

### Data visibility pain points

- Users do not know what data flows through the workflow.
- Users do not know whether the workflow touches customer data, payment data, sensitive internal data, or regulated data.
- Users do not know whether sensitive data is passed into an AI model or external system.

---

## Pillar 2: Ownership

**Core question:** Who is responsible when automations or agents break?

### Responsibility pain points

- Users do not know which team owns a workflow or AI agent.
- Users do not know whether the listed owner is still the right contact person.
- Users do not know whether the team actually understands the business logic.
- Users do not know which teams depend on the automation and can safely make changes.

### Process pain points

- Users do not know who should be notified when a workflow reports an error.
- Users do not know who should approve workflow or AI agent changes.
- There is a delay in notifying relevant teams to fix issues.
- Users do not know whether there is a backup owner or escalation path.

### AI accountability pain points

- Users do not know who is responsible if an AI agent gives a bad recommendation.
- Users do not know who is responsible if an AI agent takes the wrong action.
- Users do not know who should approve prompt, model, tool-access, or workflow changes.
- Users do not know whether a human reviewer is required for a specific AI agent.

### Recovery ownership pain points

- Users do not know who should retry, pause, rollback, or fix the automation.
- Users do not know whether there is a runbook for common failures.
- Users do not know who should communicate impact to affected teams.

---

## Pillar 3: Relationships

**Core question:** How do automations and AI agents relate to each other?

### Dependency pain points

- Users are not sure which workflow triggers another workflow.
- Users do not know which workflows depend on previous workflows succeeding.
- Users do not know whether one failed workflow will affect another workflow later.
- Users are not sure which exact business process a workflow affects in the wider SOP.

### Shared resource pain points

- Users do not know which workflows share common data sources.
- Users do not know whether one shared credential, API key, database, or data table affects multiple workflows.
- Users do not know whether a shared resource change will break another workflow.

### Agent relationship pain points

- Users do not know which tools, APIs, databases, or automations an AI agent can call.
- Users do not know whether an AI agent calls another workflow.
- Users do not know whether an AI agent decision affects another automation step.

### Blast-radius pain points

- Users do not know what happens downstream if a workflow fails.
- Users do not know the blast radius of pausing, editing, or deleting a workflow.
- Users do not know whether a failure affects one customer, many customers, an internal team, or a critical business process.

### Duplication and overlap pain points

- Users do not know whether two workflows are doing similar work.
- Users do not know whether old and new versions of the same workflow are both running.
- Users do not know whether multiple automations are writing to the same system in conflicting ways.

---

## Proactive operational response pain

This is the layer across all three pillars.

Enterprise teams do not only need to know what exists. They need to know what requires attention.

Key unanswered questions:

- What changed?
- Why did it fail?
- Why does it matter?
- Who should act?
- What should happen next?
- How urgent is it?
- Who needs to be notified?

---

# 2. Solutions

## Solution principle

Avoid building another execution analytics dashboard. n8n already has health insights such as production executions, failure rate, average runtime, and time saved.

The solution should focus on the missing enterprise backoffice layer:

- Meaning
- Ownership
- Relationships
- Change context
- AI governance
- Recommended next action

---

## Visibility solution: Automation Registry

**Goal:** Turn raw workflows and agents into a business-readable inventory.

### What it does

- Creates a central registry of all workflows and AI agents.
- Shows business purpose for every workflow or AI agent.
- Generates AI summaries of purpose, input, output, systems touched, and expected result.
- Classifies workflow type:
  - Deterministic automation
  - AI-assisted workflow
  - AI agent with tool access
  - Human-in-the-loop workflow
- Shows prompts, models, tools, credentials, and data sources used.
- Adds criticality and business-process tags.
- Surfaces stale, abandoned, duplicated, risky, or recently changed workflows.

### How it solves the problem

Instead of asking users to inspect nodes, executions, and workflow names manually, the registry answers:

- What is this?
- Why does it exist?
- What business process does it support?
- Is AI involved?
- What systems and data does it touch?
- Is it production-critical or experimental?

### Example item

```text
Refund Review Agent

Purpose:
Reviews Zendesk refund requests and drafts a recommended reply.

Type:
AI agent with tool access.

Input:
Zendesk ticket, customer history, order value.

Output:
Suggested refund decision and draft customer reply.

Systems:
Zendesk, Stripe, Gmail.

Risk:
High — customer-facing decision support.
```

---

## Ownership solution: Responsibility Center

**Goal:** Make accountability explicit and actionable.

### What it does

- Shows owner, backup owner, approver, and escalation path for each workflow or agent.
- Creates queues for:
  - Missing owner
  - Stale owner
  - No approver
  - No escalation path
  - No runbook
  - AI accountability gap
  - Prompt change needing approval
- Suggests likely owner based on:
  - Creator
  - Last editor
  - Project
  - Connected systems
  - Credential owner
  - Team mapping
  - Similar workflows
  - Previous incident ownership
- Provides an approval flow for workflow, prompt, model, trigger, credential, and tool-access changes.
- Generates recovery runbooks and suggested escalation paths.

### How it solves the problem

Ownership is not just a field. The app should infer likely responsibility, explain why, and ask humans to confirm.

The AI should recommend accountability, but humans should confirm it.

### Example item

```text
Ownership gap detected

Workflow:
Customer Onboarding

Issue:
Production workflow touches Stripe and HubSpot but has no confirmed owner.

Suggested owner:
RevOps

Why:
Uses sales/customer systems, was last edited by a RevOps user, and affects onboarding.

Action:
Ask RevOps to confirm ownership.
```

---

## Relationship solution: Dependency & Blast Radius Map

**Goal:** Show how workflows, agents, systems, data sources, and teams relate.

### What it does

- Maps workflow-to-workflow dependencies.
- Maps AI agent-to-tool relationships.
- Maps AI agent-to-workflow relationships.
- Shows shared credentials, APIs, databases, data tables, Slack channels, and external systems.
- Groups workflows by business process, such as onboarding, billing, support, reporting, and lead routing.
- Provides blast-radius analysis:
  - What breaks if this fails?
  - What is affected if I edit, pause, or delete this?
  - Which teams or customers are affected?

### How it solves the problem

Instead of showing workflows as isolated objects, the app shows the operational system they form together.

### Example dependency chain

```text
Stripe Webhook
   ↓
Customer Onboarding Workflow
   ↓
HubSpot Contact Update
   ↓
Slack CS Alert
   ↓
Welcome Email Agent
   ↓
Revenue Dashboard
```

### Example blast radius

```text
If Customer Onboarding fails:

Affected teams:
- Customer Success
- RevOps
- Finance

Business impact:
- New customers may not be onboarded
- HubSpot may be stale
- CS may not receive Slack alerts
- Revenue dashboard may be delayed

Shared resources:
- HubSpot production credential
- Stripe webhook
- #cs-alerts Slack channel
```

---

## Proactive solution: Backoffice Brief

**Goal:** Tell users what needs attention now.

### What it does

A proactive feed or daily brief that surfaces important operational issues:

- Risky prompt changes
- Missing owners
- Stale owners
- Workflows with no approver
- Shared credential risk
- Stale workflows with production access
- AI agents with tool access and no human review
- Workflow changes with high blast radius
- Failures where the business impact is significant

### How it solves the problem

Instead of expecting enterprise users to inspect dashboards manually, Backoffice Brief routes attention.

Each card answers:

- What changed?
- Why does it matter?
- Who should act?
- What should happen next?

### Example brief

```text
Backoffice Brief

Needs attention today:

1. Refund Review Agent changed behaviour
Prompt now recommends refund decisions instead of only summarising tickets.
Needs Support Lead approval.

2. Customer Onboarding has no backup owner
High-risk workflow touching Stripe and HubSpot.

3. Salesforce credential is shared by 5 workflows
Credential expiry could affect lead routing, onboarding, and reporting.

4. Old test workflow still has Gmail send access
Stale workflow with production permission.
```

---

# 3. Product Ideas

## Overall product suite: n8n Backoffice

**n8n Backoffice** is a native enterprise module inside n8n that helps teams understand, govern, and operate workflows and AI agents at scale.

It is not a replacement for n8n Insights. It complements Insights.

- n8n Insights answers: How many ran? How many failed? What is the failure rate?
- n8n Backoffice answers: What does it mean? Who owns it? What depends on it? What changed? What should happen next?

## Recommended product surface

### Primary home: inside n8n

n8n Backoffice should live inside n8n because the source of truth and fixing surface are already inside n8n:

- Workflows
- Executions
- Credentials
- Variables
- Data tables
- AI nodes
- Agents
- Workflow edit history
- Project and permission context

### Secondary surfaces: external integrations

Proactive alerts and approvals should happen where teams already work:

- Slack
- Microsoft Teams
- Jira
- Linear
- PagerDuty
- Opsgenie
- GitHub
- Notion
- Confluence

---

## App IA / Navigation

Inside n8n, add a sidebar module:

```text
Backoffice
├── Brief
├── Registry
├── Responsibility
├── Map
└── Change Memory
```

Optional future tabs:

```text
├── AI Agents
├── Runbooks
├── Approvals
└── Settings
```

---

## Screen 1: Backoffice Brief

**Purpose:** What needs attention now?

This is the home screen and the main demo moment.

### Content

- Risky changes
- Ownership gaps
- Approval needs
- Shared resource risks
- Critical dependency warnings
- AI agent governance issues
- Suggested next actions

### Card format

```text
[Issue title]

What happened:
...

Why it matters:
...

Suggested owner:
...

Recommended next step:
...

Actions:
[Open in n8n] [Assign owner] [Create ticket] [Approve] [Dismiss]
```

### Example

```text
Refund Review Agent changed behaviour

What happened:
The prompt changed from summarising refund requests to recommending approve/reject decisions.

Why it matters:
This moved the agent from information retrieval to customer-impacting decision support.

Suggested owner:
Support Ops

Recommended next step:
Request Support Lead approval before production use.
```

---

## Screen 2: Automation Registry

**Purpose:** What is running and what does it do?

### Columns

- Workflow / Agent name
- Type
- Business purpose
- Status
- Owner
- Criticality
- AI involved?
- Systems touched
- Last meaningful change
- Risk label

### Useful filters

- Uses AI
- Has tool access
- No owner
- No approver
- Customer-facing
- Touches sensitive data
- Recently changed
- Stale
- Production-critical
- Shared credential

### Example rows

```text
Stripe → Onboarding | Workflow | Starts customer onboarding | RevOps | High | No AI | Stripe, HubSpot, Slack
Refund Review Agent | AI Agent | Drafts refund decision | Support Ops | High | AI | Zendesk, Stripe, Gmail
Lead Routing | Workflow | Routes inbound leads | Sales Ops | Medium | No AI | HubSpot, Salesforce
Revenue Report Agent | AI Agent | Creates weekly finance report | Finance | Low | AI | BigQuery, Slack
```

---

## Screen 3: Workflow / Agent Detail

**Purpose:** Explain one workflow or agent clearly.

### Sections

1. Summary
2. Ownership
3. Relationships
4. AI Behaviour
5. Change Memory
6. Runbook

### Example detail page

```text
Refund Review Agent

Status: Risky
Type: AI Agent
Owner: Support Ops
Risk: High
Last changed: 2 hours ago
```

### Summary section

```text
Business purpose:
Reviews refund requests from Zendesk and drafts a recommended response.

Input:
Zendesk ticket, customer history, order value.

Output:
Suggested refund decision and draft customer reply.

AI behaviour:
This agent recommends a refund decision. It does not directly send the reply.
```

### Ownership section

```text
Confirmed owner:
Support Ops

Suggested approver:
Support Lead

Backup owner:
Not assigned

Why this owner:
Uses Zendesk tickets, customer history, and refund policy logic.
```

### Relationship section

```text
Upstream:
Zendesk ticket created

This agent:
Refund Review Agent

Downstream:
Draft reply → Support queue → Customer response

If this breaks:
Support team may miss refund requests or send inconsistent replies.
```

### Change memory section

```text
Prompt changed 2 hours ago

Old behaviour:
Summarise refund request.

New behaviour:
Recommend approve or reject refund.

Risk:
Agent moved from summarisation to decision support.

Suggested action:
Require Support Lead approval.
```

### Runbook section

```text
If this fails:
1. Check Zendesk connection.
2. Review latest prompt change.
3. Confirm output format is valid.
4. Disable auto-drafting if recommendations look unsafe.
5. Escalate to Support Ops.
```

---

## Screen 4: Responsibility Center

**Purpose:** Who owns what, and what needs accountability?

### Queues

- Missing owner
- Stale owner
- Missing backup owner
- Missing approver
- Prompt change needs approval
- No escalation path
- No runbook
- AI agent lacks human review

### Example card

```text
Needs approver

Workflow:
Refund Review Agent

Problem:
Agent recommends refund decisions but has no prompt approver.

Suggested approver:
Support Lead

Why:
This agent affects customer refund handling.

Actions:
[Request approval] [Assign approver] [Open agent]
```

---

## Screen 5: Dependency Map

**Purpose:** How do workflows and agents relate?

### Views

- Workflow dependency graph
- AI agent-to-tool graph
- Shared resource map
- Business process map
- Blast-radius view

### Example focused map

```text
Stripe Subscription Created
   ↓
Customer Onboarding
   ↓
HubSpot Update
   ↓
Slack CS Alert
   ↓
Welcome Email Agent
   ↓
Revenue Dashboard
```

### Side panel

```text
Selected workflow:
Customer Onboarding

Shared resources:
- HubSpot credential
- Stripe webhook
- Slack channel #cs-alerts

Affected teams:
- RevOps
- Customer Success
- Finance

If paused:
New customers may not be onboarded.
```

---

## Screen 6: Change Memory

**Purpose:** What changed before something broke or became risky?

### Tracks

- Workflow edits
- Trigger changes
- Credential changes
- Prompt changes
- Model changes
- Tool-access changes
- Ownership changes
- Approval decisions

### Example

```text
Change detected:
Refund Review Agent prompt changed 2 hours ago.

Previous behaviour:
Summarised refund request.

New behaviour:
Recommends refund approval or rejection.

Backoffice interpretation:
The agent moved from informational to decision-support.

Suggested action:
Require Support Lead approval.
```

---

## Slack app integration demo

Slack should be a secondary action surface, not the primary product.

### Slack alert example

```text
n8n Backoffice Alert

Customer Onboarding failed 6 times in 30 minutes.

Likely impact:
New Stripe customers may not be added to HubSpot or notified in Slack.

Suggested owner:
RevOps

Recommended action:
Reconnect HubSpot credential and replay failed executions.

Actions:
[Open in n8n] [Assign owner] [Create Linear ticket] [Mark acknowledged]
```

### Slack approval example

```text
n8n Backoffice Approval Needed

Refund Review Agent prompt changed.

Risk:
The agent now recommends refund decisions instead of only summarising tickets.

Suggested approver:
Support Lead

Actions:
[Approve] [Request changes] [Rollback prompt] [Open diff]
```

### Slack ownership confirmation example

```text
n8n Backoffice Ownership Check

Workflow:
Lead Routing

Suggested owner:
Sales Ops

Reason:
The workflow uses HubSpot and Salesforce and affects inbound lead assignment.

Actions:
[Confirm owner] [Reassign] [Not my team]
```

---

## Extended app / future ideas

### Natural-language search

Users can ask:

```text
Show me all customer-facing AI agents with no owner.
Which workflows touch Stripe and HubSpot?
What changed before Customer Onboarding started failing?
Which agents can send emails?
Which workflows share the Salesforce credential?
```

### AI-generated documentation

Automatically generate:

- Business purpose
- Inputs and outputs
- Failure modes
- Recovery steps
- Ownership rationale
- Dependency explanation
- Prompt behaviour summary

### Governance score

A workflow or agent score based on:

- Has owner
- Has backup owner
- Has approver
- Has runbook
- Has criticality label
- Has clear business purpose
- Has human review if agentic
- Has no risky unapproved changes

### Approval workflows

Require approval for:

- Prompt changes
- Model changes
- Tool-access changes
- Credential changes
- Trigger changes
- High-blast-radius workflow edits

### Incident handoff

Create tickets or incidents in:

- Linear
- Jira
- PagerDuty
- Opsgenie
- Slack

### Documentation sync

Sync generated runbooks and process docs to:

- Notion
- Confluence
- Google Docs

---

## External app connections and ecosystem

### Native n8n sources

- Workflows
- Executions
- Credentials
- Variables
- Data tables
- AI nodes
- Agent nodes
- Project metadata
- User metadata
- Workflow history

### Communication and action systems

- Slack
- Microsoft Teams
- Email
- PagerDuty
- Opsgenie

### Task and incident systems

- Linear
- Jira
- GitHub Issues

### Documentation systems

- Notion
- Confluence
- Google Docs

### Business context systems

- Salesforce
- HubSpot
- Stripe
- Zendesk
- Intercom
- Gmail
- BigQuery
- Postgres
- Snowflake

### Engineering context systems

- GitHub
- GitLab
- Datadog
- Sentry
- OpenTelemetry

---

## AI involvement

AI should be used where rules and metrics are not enough.

### AI use cases

- Summarise workflow purpose from nodes, prompts, and execution patterns.
- Explain AI agent behaviour from prompts, models, tools, and permissions.
- Infer likely owner and explain the reasoning.
- Detect risky prompt/model/tool-access changes.
- Translate technical errors into business impact.
- Generate runbooks and safe recovery steps.
- Power natural-language search over workflows, agents, systems, and owners.
- Detect duplicate or overlapping workflows.
- Summarise blast radius in business language.

### Important AI design principle

AI should recommend. Humans should confirm accountability and approval.

---

# 4. Presentation Structure

## Slide 1 — Title

**n8n Backoffice**

The operational control room for enterprise automations and AI agents.

---

## Slide 2 — Problem

Enterprise users have many workflows and AI agents, but no clear understanding of:

- What is actually running and what it does
- Who is responsible when it breaks
- How workflows and agents relate to each other

Add your core reframe:

> This is not just a monitoring problem. It is an operational memory, ownership, and dependency problem.

---

## Slide 3 — Existing Gap

Show that n8n already has Insights.

Existing Insights answer:

- How many executions happened?
- How many failed?
- What is the failure rate?
- What is the average runtime?

But Enterprise users still need answers to:

- What does this workflow mean?
- Who owns it?
- What changed?
- What depends on it?
- What should happen next?

---

## Slide 4 — Design Framework

Introduce the three pillars:

```text
Visibility
What is running and what does it do?

Ownership
Who is responsible when it breaks?

Relationship
How do workflows and agents relate?
```

Optional line:

> The proactive layer across all three: what changed, why it matters, and what should happen next.

---

## Slide 5 — Pain Point Map

Show your FigJam board.

Group pain points by:

- Visibility
  - Runtime visibility
  - Inventory visibility
  - Purpose visibility
  - Trigger visibility
  - AI behaviour visibility
- Ownership
  - Responsibility
  - Process
  - Approval
  - AI accountability
- Relationship
  - Dependencies
  - Shared resources
  - Agent-to-tool relationships
  - Blast radius

---

## Slide 6 — Solution Direction

Map each pillar to a solution:

| Pillar | Solution module |
|---|---|
| Visibility | Automation Registry |
| Ownership | Responsibility Center |
| Relationship | Dependency & Blast Radius Map |
| Proactive response | Backoffice Brief |

---

## Slide 7 — Product Concept

Introduce the product:

**n8n Backoffice**

A native Enterprise module inside n8n, with external action surfaces in Slack, Teams, Jira, Linear, and PagerDuty.

Core modules:

- Backoffice Brief
- Automation Registry
- Responsibility Center
- Dependency Map
- Change Memory
- Runbook Assistant

---

## Slide 8 — Product Walkthrough

Demo flow:

```text
Backoffice Brief
→ Automation Registry
→ Workflow / Agent Detail
→ Responsibility Center
→ Dependency Map
→ Change Memory / Runbook
→ Slack approval or alert
```

Use one scenario:

```text
Refund Review Agent prompt changed from summarising refund requests to recommending refund decisions.
```

Show how the product:

- Detects the change
- Explains the risk
- Identifies the owner
- Shows downstream impact
- Requests approval in Slack
- Generates a runbook

---

## Slide 9 — AI Layer

AI is used to:

- Summarise workflow purpose
- Explain agent behaviour
- Infer ownership
- Detect risky prompt/model/tool changes
- Translate failures into business impact
- Generate runbooks
- Power natural-language search

Key line:

> AI recommends; humans confirm ownership and approval.

---

## Slide 10 — Ecosystem and Architecture

Show high-level architecture:

```text
n8n workflows / executions / credentials / AI nodes
        ↓
Backoffice metadata + relationship graph
        ↓
AI summarisation + ownership inference + blast-radius analysis
        ↓
Native n8n UI + Slack/Jira/PagerDuty actions
```

Mention integrations:

- Slack / Teams
- Jira / Linear
- PagerDuty / Opsgenie
- GitHub
- Notion / Confluence
- Salesforce / HubSpot / Stripe
- Datadog / Sentry

---

## Slide 11 — What I Would Build for MVP

MVP scope:

- Backoffice Brief
- Automation Registry
- Workflow / Agent Detail
- Responsibility Center
- Dependency Map
- Change Memory
- Slack alert mock

Explicitly not in MVP:

- Full real-time monitoring
- Full RBAC model
- Full production n8n API integration
- Complete incident-management workflow

Reason:

> The prototype focuses on the product model and interaction pattern, not complete enterprise infrastructure.

---

## Slide 12 — Prompt Log and Trade-offs

Show that you kept a prompt log.

Prompt log categories:

- Problem framing
- Pain point mapping
- Solution exploration
- Product naming
- UI structure
- AI feature design
- Presentation structure

Trade-off statement:

> I avoided building more execution metrics because n8n already has Insights. I focused on the missing enterprise layer: meaning, responsibility, relationships, and action.

---

# Implementation Notes for Another Agent

## Suggested prototype scope

Build a clickable or coded prototype with mocked data.

### Required screens

1. Backoffice Brief
2. Automation Registry
3. Workflow / Agent Detail
4. Responsibility Center
5. Dependency Map
6. Change Memory
7. Slack alert mock

### Suggested mock scenario

Use this scenario throughout the demo:

```text
Refund Review Agent

A Support Ops AI agent that reviews Zendesk refund requests and drafts a recommended response.

Recent change:
Prompt changed from summarising refund requests to recommending approve/reject decisions.

Risk:
The agent moved from informational summarisation to customer-impacting decision support.

Suggested action:
Require Support Lead approval.
```

### Secondary scenario

```text
Customer Onboarding Workflow

A deterministic workflow triggered by Stripe subscription creation.

Flow:
Stripe → HubSpot → Slack CS alert → Welcome Email Agent → Revenue Dashboard

Issue:
No backup owner and shared HubSpot credential affects multiple workflows.
```

## Suggested mock data objects

### Workflow / Agent

```json
{
  "id": "wf_refund_review_agent",
  "name": "Refund Review Agent",
  "type": "AI Agent",
  "status": "Risky",
  "businessPurpose": "Reviews Zendesk refund requests and drafts a recommended reply.",
  "input": ["Zendesk ticket", "Customer history", "Order value"],
  "output": ["Refund recommendation", "Draft customer reply"],
  "systems": ["Zendesk", "Stripe", "Gmail"],
  "owner": "Support Ops",
  "backupOwner": null,
  "approver": null,
  "criticality": "High",
  "riskReason": "Customer-facing decision support",
  "usesAI": true,
  "model": "GPT-4.1",
  "tools": ["Zendesk", "Stripe lookup", "Gmail draft"],
  "lastMeaningfulChange": "Prompt changed 2 hours ago"
}
```

### Backoffice Brief item

```json
{
  "severity": "High",
  "title": "Refund Review Agent changed behaviour",
  "whatHappened": "Prompt changed from summarising refund requests to recommending approve/reject decisions.",
  "whyItMatters": "The agent moved from informational summarisation to customer-impacting decision support.",
  "suggestedOwner": "Support Ops",
  "recommendedAction": "Request Support Lead approval before production use.",
  "actions": ["Open in n8n", "Request approval", "Rollback prompt", "Create Linear ticket"]
}
```

### Dependency example

```json
{
  "source": "Stripe Subscription Created",
  "target": "Customer Onboarding Workflow",
  "type": "trigger"
}
```

```json
{
  "source": "Customer Onboarding Workflow",
  "target": "HubSpot Contact Update",
  "type": "writes_to"
}
```

```json
{
  "source": "Customer Onboarding Workflow",
  "target": "Welcome Email Agent",
  "type": "triggers"
}
```

## Visual style direction

- Match n8n dark mode.
- Use orange accents to feel native to n8n.
- Do not over-index on charts.
- Use action cards, queues, detail panels, and dependency maps.
- Make the homepage feel like an operational brief, not an analytics dashboard.

## Key demo message

> n8n Insights tells you how workflows are performing. n8n Backoffice tells you what those workflows mean, who owns them, what depends on them, and what action to take when something changes or breaks.
