# n8n Backoffice — Phase 1 Design Spec

**Date:** 2026-07-09
**Status:** Draft for approval
**Scenario anchor:** Refund Review Agent (prompt changed from *summarise* → *recommend approve/reject* refund decisions).

---

## 1. Thesis

n8n Insights answers *how workflows are performing* (executions, failure rate, runtime).
n8n Backoffice answers *what they mean, who owns them, what they relate to, what changed, and what to do next.*

Phase 1 proves the product model and interaction pattern on **real workflow data** and a **real Slack app** — not a full enterprise platform.

## 2. Scope

### In (Phase 1)
- **Brief** — ranked feed of workflow changes + issues; also delivered to Slack, routed by owner.
- **Registry** — business-readable inventory of all workflows + AI agents.
- **Detail** — one workflow/agent explained, including a **Relationships** section (auto + manual links).
- **Ownership** — owner team + Slack channel, assigned from the **live connected Slack** workspace.
- **Slack app** — health alerts (routed to owner channel), change/approval notices, ownership check, daily Brief.
- **Change detection (headless)** — diff workflows between syncs to feed the Brief and Detail; no dedicated timeline screen.

### Out (deferred to Phase 2+)
- Responsibility Center (as a dedicated screen).
- Change Memory (as a dedicated timeline screen).
- Full interactive Dependency Map canvas + SOP business-process grouping overlay.
- DM-to-individual-owner (Phase 1 is channel-only).
- Natural-language search, governance score, approval engine / RBAC.
- Teams / Jira / PagerDuty / Notion / GitHub integrations (Slack + a Linear-ticket action only).
- Real-time streaming (Phase 1 = polling).

## 3. Architecture

Standalone **Next.js (App Router) full-stack** app, deployed to Vercel.

```
Browser (6-ish screens, n8n dark + coral theme)
        │
Next.js route handlers  ──►  n8n REST API  (workflows, executions, credentials, projects, users)
        │             ──►  OpenAI                — enrichment
        │             ──►  Slack Web API         — list channels, post messages
        │             ◄──  Slack interactivity/events — button actions, verification
        ▼
Backoffice store (owners, routing config, manual links, confirmed change state)
```

- **Store:** lightweight persisted store (Postgres/SQLite or a hosted KV) for data n8n doesn't own: confirmed owners, team→channel routing, manual workflow links, dismissed/acknowledged Brief items, last-synced workflow snapshots (for diffing).
- **Sync:** derive on load + manual refresh + periodic poll. The graph/registry is a pure function of current n8n data + the store, so sync = re-fetch + re-derive + diff.
- **Secrets:** `.env.local` — `N8N_BASE_URL`, `N8N_API_KEY`, `OPENAI_API_KEY`, `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET`. Never in the client bundle; all provider calls are server-side.

## 4. Data derivation (from real n8n)

For each workflow, parse nodes + connections and derive:

- **Type:** deterministic / AI-assisted / AI-agent-with-tools / human-in-loop (from node types — LangChain agent/LLM nodes, tool connections, wait/approval nodes).
- **Systems touched:** from node types + credential types (Stripe, HubSpot, Zendesk, Gmail, BigQuery…).
- **Trigger:** schedule / webhook / manual / form / chat / sub-workflow; next run for schedules.
- **Health:** recent execution status + failure counts (from executions API).
- **Criticality / risk labels:** heuristics (prod-active + customer-facing systems + AI-with-tools + no owner) refined by AI.

### Relationships (edges)

| Tier | Edge | Signal | Trust |
|---|---|---|---|
| A | workflow → workflow | `Execute Workflow` node target `workflowId` | exact |
| A | agent → tool | AI Agent `ai_tool` connections (incl. workflow-as-tool) | exact |
| A | workflow ↔ credential | shared credential ID | exact |
| B | workflow → system | same Slack channel / DB table / object in node params | inferred (dashed) |
| C | webhook → caller | webhook path vs HTTP Request URL | weak (dashed) |
| **M** | **manual link** | **user-curated (Jira-style)** | **asserted by human** |

**Manual links (Jira-style "related workflows"):**
- On a Detail page: *Add related workflow* → pick a workflow + relationship type (`depends on`, `triggers`, `duplicate of`, `part of process`, `shares data with`).
- Bidirectional — shown on both workflows; tagged **manual** vs **auto**; removable.
- Stored in the Backoffice store. Becomes the human seed for SOP grouping in Phase 2.

## 5. Screens

### 5.1 Brief (home)
- Ranked cards (severity-ordered): risky change, missing/stale owner, shared-credential risk, stale workflow w/ prod access, AI-agent w/ tools + no review, high-impact failure.
- Card = what happened / why it matters / suggested owner / recommended next step / actions (Open in n8n, Request approval, Assign owner, Create Linear ticket, Dismiss).
- Header shows Slack delivery status. "Sent to Slack ✓".

### 5.2 Registry
- Table: name, type, business purpose, owner, criticality, AI?, systems, last meaningful change, risk.
- Filters: uses AI, has tool access, no owner, customer-facing, sensitive data, recently changed, stale, prod-critical, shared credential.
- **Owner assignment inline** — reads live Slack (see §6). Row → Detail.

### 5.3 Detail
Sections: Summary (business purpose, input, output, AI behaviour) · Ownership (owner team, channel, approver, *why this owner*) · **Relationships** (auto Tier-A edges + manual links, with "if this breaks…") · AI behaviour (model, tools, human review?) · Change (latest diff + AI interpretation) · Runbook (AI-generated).

## 6. Ownership + Slack routing

- **Owner model:** *team label* (free text/choose, e.g. "Support Ops") + *alert channel* (picked from the live connected Slack). Optional escalation channel.
- **Live channel picker:** Registry/Detail read `conversations.list` from the connected workspace. If Slack not connected → "Connect Slack" prompt.
- **Gotcha handled:** a bot can list public channels but must be **invited** to post. Picker flags "bot not in channel — invite to enable alerts"; demo setup script invites the bot.
- **Inference:** owner pre-filled from creator / last editor / project / connected systems / credential owner, with reasoning. Human confirms once; stored.
- **Phase 1 routing:** channel-only (no per-person DM).

## 7. Slack app

- **OAuth scopes:** `channels:read`, `groups:read`, `chat:write`, `commands`, plus interactivity + events. (`users:read` deferred with DM.)
- **Endpoints (Next.js route handlers):** OAuth callback; interactivity (button actions, signature-verified); events.
- **Message types:**
  1. **Health alert** → owner channel: failure summary, likely impact, owner, recommended action; buttons Open in n8n / Assign owner / Create Linear ticket / Mark acknowledged.
  2. **Change / approval notice** → owner channel: prompt/model/tool change + risk; buttons Approve / Request changes / Rollback / Open diff. Decision writes back to store.
  3. **Ownership check** → channel: suggested owner + reason; Confirm / Reassign / Not my team → writes back.
  4. **Daily Brief** → master `#n8n-backoffice` + per-team slices.
- **Signature verification** on all inbound Slack requests.

## 8. AI layer (OpenAI)

Server-side only. Uses: summarise business purpose/input/output; explain agent behaviour; infer owner + reasoning; classify change risk (summarise→decide is high); translate technical error → business impact; generate runbook; blast-radius in business language.

**Principle:** AI recommends; humans confirm ownership and approval. Every AI-derived field is labelled and editable.

## 9. Change detection (headless)

- Each sync snapshots key workflow fields (prompts, model, tool connections, trigger, active state, credentials) to the store.
- Next sync diffs against the snapshot → change events → feed Brief cards + Detail "Change" section.
- Prompt/behaviour changes get an AI risk interpretation.

## 10. Demo setup

- Slack demo channels: `#n8n-backoffice`, `#support-ops`, `#finance`, `#people-ops`, `#revops`, `#sales-ops`, `#cs-alerts`.
- Team→channel routing seeded so anchor scenarios (Refund Review Agent → Support Ops, Customer Onboarding → RevOps) post live.
- n8n instance: **user-provided URL + API key**, pre-populated with the scenario workflows.

## 11. Open items / risks

- **Change Memory data depth:** the public API exposes workflow *version history* weakly. Phase 1 relies on our own snapshot-diffing (from first sync forward) rather than backfilled history. Acceptable for the demo; note it.
- **Tier-B/C edges are heuristic** — always shown as "possible," never asserted.
- **Slack posting requires channel invites** — handled in setup.

## 12. Deliverable

Deployed Vercel link + the demo Slack workspace, walking the anchor scenario end-to-end: detect prompt change → explain risk → identify owner → show relationships/impact → post approval to `#support-ops` → generate runbook.
