# QA & Demo Plan — n8n Otto (Web + Slack)

Test and rehearse the three demo flows end-to-end. Each feature has: **what to test (web)**,
**what to test (Slack)**, a **test-case table** (steps → expected), and a **demo script** (the exact
sequence to run live on the slide).

Maps 1:1 to the deck: Slide 7 = Briefs, Slide 8 = Ownership, Slide 9 = SOP groups.

---

## 0. Environment & pre-flight

### What is live vs mocked (this repo, current `.env`)
| Capability | Status | Notes |
|---|---|---|
| n8n estate data | **Demo fixtures** | `N8N_*` unset → **18 bundled workflows across 8 teams** (Refund Review Agent scenario + Billing/CS/IT). Set `N8N_BASE_URL`+`N8N_API_KEY` to read a real n8n instead. |
| OpenAI (Otto brain + AI summaries) | **Live** | `OPENAI_API_KEY` set. |
| Slack app (install, events, post, interactivity) | **Live** | `SLACK_*` set. Needs bot in target channels. |
| Linear ticketing | **Live** | `LINEAR_API_KEY` + `LINEAR_TEAM_ID` set. |
| Postgres store | **Live** | `DATABASE_URL` (Supabase/Neon). |
| Crons | Guarded by `CRON_SECRET` | Invoke manually with Bearer token (below). |
| Live-failure webhook | Guarded by `N8N_WEBHOOK_SECRET` | Only if you wire the n8n error webhook; else simulate via cron/notify. |

### Start-up
```bash
pnpm install
pnpm prisma migrate deploy      # or `migrate dev` locally
pnpm dev                        # http://localhost:3000 → redirects to /brief
pnpm test                       # vitest — classify, edges, risk, diff, brief rules, slack verify/routing
```
Prod: `https://n8n-backoffice.vercel.app` (Slack manifest points here for events/interactivity/oauth).

### One-time Slack setup (before any Slack demo)
1. App created from `docs/slack-app-manifest.yaml` (bot `n8n-otto`, scopes incl. `app_mentions:read`, `chat:write`, `channels:history`).
2. Install: visit `/api/slack/install` → approve → lands via `/api/slack/oauth`.
3. Seed channels: `pnpm setup:demo` → creates `#n8n-backoffice #support-ops #revops #sales-ops #people-ops #finance #cs-alerts #billing-ops #cs-ops #it-ops`.
4. **Invite the bot to every channel you'll demo in** (`/invite @n8n-otto`). The bot can only post/read where it's a member — this is the #1 demo failure.
5. Owners are intentionally **not** seeded — you assign them from the Registry (Feature 2).

### Cron / webhook invocation (for Slack demos without waiting for schedule)
```bash
# Daily brief to channels
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/brief
# Real-time attention sweep (posts new issues to owner channels)
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notify
# Escalate unacked high-severity to escalation channel
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/escalate
# Simulate an n8n failure signal (if N8N_WEBHOOK_SECRET set)
curl -s -X POST "http://localhost:3000/api/n8n/execution?secret=$N8N_WEBHOOK_SECRET"
```

### Pre-flight smoke (run before every demo)
- [ ] `pnpm test` green.
- [ ] `/brief` loads with cards (not empty, not error).
- [ ] `/registry`, `/map`, one `/workflow/[id]` all render.
- [ ] Slack: `@n8n-otto hello` in a channel the bot is in → replies in-thread.
- [ ] `curl` cron/brief returns `{ ran: "brief", ok: true }` and a message lands in `#n8n-backoffice`.

---

## Feature 1 — Visibility via Briefs (Slide 7)

**Claim:** Otto reads runs → plain-language brief (summary + ranked issues), one click to Slack.

### Web — screen `/brief`
| ID | Steps | Expected |
|---|---|---|
| B-1 | Open `/brief` | Ranked "needs attention now" cards; healthy/failing counts; each card = workflow + why it needs attention + severity. |
| B-2 | Read a failing card (e.g. Refund Review Agent) | Plain-language reason (not raw logs), severity chip, owner (or "unowned"). |
| B-3 | Click **Send to Slack** on a card (`BriefActions`) | Toast confirms; card content posts to the mapped channel (master `#n8n-backoffice` if no owner). |
| B-4 | Reload `/brief` | Ranking stable; no duplicate/ghost cards. |

### Slack — brief delivery + NL query
| ID | Steps | Expected |
|---|---|---|
| B-5 | `curl` `/api/cron/brief` | Digest posts to `#n8n-backoffice`: "N healthy · M failing · <top issues>". |
| B-6 | `@n8n-otto what needs attention right now?` | In-thread summary sourced from `estate_summary`/brief store — counts + ranked issues. |
| B-7 | `@n8n-otto what changed this week?` | `recent_changes` — prompt/model/tool/trigger diffs, not invented. |
| B-8 | `@n8n-otto what's our estate worth?` | Value/waste ledger (hours saved, idle/failing). |

### Demo script (Slide 7)
1. Show `/brief` — point at "3 healthy · 1 failing", read the failing card in plain English.
2. Click **Send to Slack** → cut to Slack, card lands in `#n8n-backoffice`.
3. (Optional) `@n8n-otto what needs attention right now?` → in-thread brief. **Punchline:** "the brief is where the team already works."

---

## Feature 2 — Ownership via Slack channels (Slide 8)

**Claim:** each workflow → a Slack channel; the channel gets briefs, real-time issues, and suggestions. NL routing + Linear handoff.

### Web — screen `/registry`
| ID | Steps | Expected |
|---|---|---|
| O-1 | Open `/registry` | Inventory of 10 workflows with type/systems/status filters. |
| O-2 | On a workflow, open the owner picker (`SlackChannelPicker`) | Picker lists **live** Slack channels (from `conversations.list`). If not installed, "Connect Slack" link appears. |
| O-3 | Assign **Refund Review Agent → #support-ops** | Persists (reload holds); shows on the workflow's Detail page ownership section. |
| O-4 | Open `/workflow/wf_refund_review_agent` | Ownership + reasoning shown; AI-inferred fields labelled + editable. |

### Slack — routing, alerts, escalation, handoff
| ID | Steps | Expected |
|---|---|---|
| O-5 | With owner set, `curl` `/api/cron/notify` | New attention item for Refund Review Agent posts to **#support-ops** (its owner channel), not the master. |
| O-5b | Also assign **Incident Triage Agent → #it-ops**, `curl` `/api/cron/notify` | Its failure routes to **#it-ops** — proves routing is per-workflow (two failing workflows, two different owner channels). |
| O-6 | `@n8n-otto who owns the Refund Agent?` | `who_owns` → team + channel + confirmed/unconfirmed. |
| O-7 | `@n8n-otto how's our ownership coverage?` | `ownership_coverage` → bus-factor, unowned-critical, stale ownership. |
| O-8 | `@n8n-otto open a Linear ticket for the Refund Agent` | **Confirm-gated** — Otto posts a confirm button (interactivity); owner + blast radius auto-attached. |
| O-9 | Click **Confirm** | `/api/slack/interactivity` creates the Linear issue; Otto replies with the issue link. |
| O-10 | Leave a high-severity item unacked, `curl` `/api/cron/escalate` | Escalates to the owner-escalation channel. |

### Demo script (Slide 8)
1. `/registry` → assign **Refund Review Agent → #support-ops** in the picker. "Ownership = routing."
2. `curl /api/cron/notify` (or trigger webhook) → live issue lands in **#support-ops**.
3. In that thread: `@n8n-otto open a Linear ticket for this` → **Confirm** → Linear link. **Punchline:** "failure → owner → ticket, never leaving Slack."

---

## Feature 3 — Relationship via SOP groups (Slide 9)

**Claim:** Otto groups workflows by SOP — generated SOP docs + deterministic (rule-based, auditable) groups.

**Deterministic grouping is real in the fixtures.** Auto SOP clusters come from `executeWorkflow`
**call edges** (+ any manual `part-of-process` links):
- **Refund Review Agent → Refund Execution** — the failing anchor, now a real 2-step SOP.
- **Customer Onboarding → Welcome Email Agent**.
- **Employee Offboarding → Access Provisioning**.
- Also surfaced (graph/relationships, not process clusters): **Content Orchestrator → Format Post** (toolWorkflow), **Sync YouTube + Sync LinkedIn** (shared Google Sheet).
- Groups start named "Business process" until you rename them (e.g. "Refund SOP", "Customer Onboarding SOP").

### Web — `/map` (two modes) + `/map/sop/[id]` + Relationships table
| ID | Steps | Expected |
|---|---|---|
| R-1 | Open `/map` | Two-mode toggle (`ModeToggle`): **SOP board** + **deterministic graph**. |
| R-2 | Deterministic graph mode | Nodes = workflows/systems; edges = call chains + shared systems (Stripe, HubSpot, Gmail…). Onboarding→Welcome Email edge visible. |
| R-3 | SOP board mode | Clusters of member workflows grouped by process. |
| R-4 | Open a group → `/map/sop/[id]` | SOP detail: member workflows, end-to-end health, owners. |
| R-5 | Rename a group (`SopRenameButton`) via the themed **PromptDialog** | e.g. "Customer Onboarding SOP" — persists, reflected in `list_processes`. No `window.prompt`. |
| R-6 | Relationships table (`ProcessTable`) + a workflow's `Relationships` panel | Auto edges (Tier A exact / B-C heuristic) + manual Jira-style links; add a manual link and see the group update. |
| R-11 | **Explain why** on a cluster | Otto gives an LLM reason grounded in the deterministic facts (call edge / shared data source / shared cred) — does not invent membership. |
| R-12 | Shared **Google Sheet** cluster | Sync YouTube + Sync LinkedIn group by `sheet_content_calendar` (resource-locator unwrapped, not two separate nodes). |

### Slack — process reasoning
| ID | Steps | Expected |
|---|---|---|
| R-7 | `@n8n-otto is the refund process healthy?` | `process_status` → end-to-end health across the chain. |
| R-8 | `@n8n-otto what breaks if the Refund Agent goes down?` | `get_blast_radius` → downstream workflows + systems + who to notify. |
| R-9 | `@n8n-otto what breaks if we rotate the Stripe key?` | `credential_impact` → every workflow sharing that credential. |
| R-10 | `@n8n-otto list our processes` | `list_processes` → named SOPs + step count + health + owners. |
| R-13 | `curl` `/api/cron/suggestions` | Otto pushes a proposed SOP cluster to a channel with **Accept / Dismiss** buttons (interactivity). |
| R-14 | Click **Accept** / **Dismiss** on a suggestion | Accept persists the group (shows in `/map` + `list_processes`); Dismiss records it (not re-suggested). |

### Demo script (Slide 9)
1. `/map` → SOP board: show "Customer Onboarding SOP" (Onboarding + Welcome Email) as one cluster. "Processes, not parts."
2. Open SOP detail → end-to-end health.
3. Slack: `@n8n-otto what breaks if we rotate the Stripe key?` → shared-credential blast radius. **Punchline:** "auditable, deterministic — the same answer every time."

---

## Cross-cutting / negative tests (do before demoing to anyone real)
| ID | Check | Expected |
|---|---|---|
| N-1 | POST `/api/slack/events` with a bad signature | 401 (verify in `lib/slack/verify.ts`). |
| N-2 | `curl` any `/api/cron/*` **without** Bearer | 401. |
| N-3 | POST `/api/n8n/execution` with wrong/absent `secret` | 401. |
| N-4 | Ask Otto about a workflow that doesn't exist | Says it can't find it — **does not invent**. Every workflow fact comes from a tool over the store. |
| N-5 | Assign owner, then remove Slack bot from that channel, `curl` notify | Graceful (no crash); post fails or falls back, logged. |
| N-6 | Duplicate brief send  twice) | No duplicate spam / debounced. |

---

## ★ Golden path — the one continuous demo (~8 min)

One story: the **Refund Review Agent is failing**. Follow that single failure through all three
features. Do NOT demo features as three disconnected clicks — thread them.

| # | Slide | Surface | Action | Say |
|---|-------|---------|--------|-----|
| 1 | 7 | Web `/brief` | Point at "3 healthy · 1 failing". Read the **Refund Review Agent** card in plain English ("errored 6× since 14:10"). | "Otto read the runs and told me what needs me — in a sentence, not a log." |
| 2 | 7 | Web → Slack | Click **Send to Slack** on that card. Cut to `#n8n-backoffice` — it lands. | "The brief shows up where the team already works." |
| 3 | 8 | Web `/registry` | Open the owner picker on Refund Review Agent → assign **→ #support-ops**. | "Ownership is routing. This workflow now has a destination." |
| 4 | 8 | Terminal → Slack | `curl /api/cron/notify` → the Refund attention item now lands in **#support-ops**, not the master. | "Same failure, now routed to the accountable team." |
| 5 | 8 | Slack `#support-ops` | In that thread: `@n8n-otto open a Linear ticket for this` → **Confirm** button → click → Linear link. | "Failure → owner → ticket, never leaving Slack. Owner + blast radius auto-attached." |
| 5b | 8 | Terminal → Slack | `curl /api/cron/notify` again → the **Incident Triage Agent** failure (a *different* team) lands in **#it-ops**, not #support-ops. | "Two failures, two owners, two channels — routing is per-workflow, automatically." |
| 6 | 9 | Web `/map` | Switch to **SOP board**. Show the **Refund SOP** (Refund Review Agent → Refund Execution) — the *same* failing agent, now as a process whose head step is red. Open **"explain why"** → Otto's reason over the `executeWorkflow` edge. | "The failure from slide 7 is actually one step of a *process* — and Otto tells you why, auditably." |
| 7 | 9 | Web `/map` | Point at the other auto-clusters: **Customer Onboarding SOP** and **IT Offboarding SOP** (Employee Offboarding → Access Provisioning). | "Otto found these SOPs deterministically — no one drew them by hand." |
| 8 | 9 | Slack | `@n8n-otto what breaks if we rotate the Stripe key?` → `credential_impact`: **4 workflows** (Refund Agent, Refund Execution, Customer Onboarding, Dunning Retry). | "One credential, four workflows. Same answer every run — that's auditable." |

**Close** on Slide 10 (What's Next) → Slide 12 (Close).

### Optional richer beats (if time / questions)
- Step 6b: `@n8n-otto is the refund process healthy?` (`process_status`) → red, because the head step (Refund Review Agent) is failing. `@n8n-otto what breaks if the Refund Agent goes down?` (`get_blast_radius`) → Refund Execution downstream.
- Slack SOP suggestion: trigger `curl /api/cron/suggestions` → Otto pushes a proposed cluster to a channel → **accept/dismiss** inline.
- `@n8n-otto what's our estate worth?` (value/waste ledger, ~854 min/day saved) for the "ROI" question.
- `@n8n-otto how's our ownership coverage?` — with 18 workflows and only a couple owned, the bus-factor / unowned-critical answer lands harder.

---

## The estate (18 workflows, 8 teams) — what lights up each feature

The demo runs on `lib/demo/fixtures.ts` (deterministic). The estate was expanded from 10 → 18 so
the story is one continuous Refund thread with real multi-team routing and real SOP chains.

**Auto-detected SOP clusters (via `executeWorkflow` call edges — no manual links):**
| SOP | Members | Health |
|---|---|---|
| **Refund SOP** | Refund Review Agent → Refund Execution | **RED** — head step failing (6×) |
| Customer Onboarding SOP | Customer Onboarding → Welcome Email Agent | healthy |
| IT Offboarding SOP | Employee Offboarding → Access Provisioning | healthy |

**Shared-credential blast radius (deterministic, from node credentials):**
| Credential | # workflows | Members |
|---|---|---|
| Stripe | **4** | Refund Review Agent, Refund Execution, Customer Onboarding, Dunning Retry |
| HubSpot | 5 | Onboarding, Lead Routing, Refund Execution, Churn Risk Agent, Health Score Sync |
| Slack | 6 | Onboarding, Revenue Report, Dunning Retry, Churn Risk, Access Provisioning, Incident Triage |
| Jira | 2 | Access Provisioning, Incident Triage Agent |

**Two failing workflows in different teams** (for the multi-team routing beat, step 5b):
- **Refund Review Agent** (6 errors) → owner **#support-ops**
- **Incident Triage Agent** (3 errors) → owner **#it-ops**

**New teams / channels:** `#billing-ops` (Refund Execution, Dunning Retry), `#cs-ops` (Churn Risk,
NPS Follow-up, Health Score Sync), `#it-ops` (Access Provisioning, Incident Triage, Employee Offboarding).

> The earlier "add Refund Execution to unify the story" recommendation is **implemented** — Features
> 1→2→3 now all follow the same Refund process. All 134 tests green (`brief/daily` yesterday totals
> updated to the expanded estate: 130 runs, 9 errors, 854 min saved).

### Real n8n vs fixtures
The core new estate is **also built in the live n8n instance** (`https://n8n-dnzu.srv1448714.hstgr.cloud`,
personal project) via the n8n MCP — for authentic screenshare of "here's my estate in n8n." These are
**graph-only**: topology + AI agents render on the canvas, agents are wired to your real **OpenAI** credential,
but Stripe/Slack/HubSpot/Jira/Gmail/Notion nodes show "credential missing" and won't execute (those creds
don't exist in the instance). The **app** still reads fixtures unless `N8N_BASE_URL`+`N8N_API_KEY` are set —
keep it on fixtures for a bulletproof demo.

| Workflow | ID | Notes |
|---|---|---|
| Refund Review Agent | `FecwiRYY6139HT6m` | Agent + Stripe/Gmail tools → **calls** Refund Execution (Refund SOP head) |
| Refund Execution | `eYzbJGz3Whgugb7r` | Sub-workflow: Stripe refund + HubSpot note |
| Dunning Retry | `AX7itJMcQxVpe00H` | Schedule → Stripe → Slack #billing-ops |
| Churn Risk Agent | `ekxyWFP5OV2vfnVU` | Agent + HubSpot tool → Slack #cs-ops |
| NPS Follow-up | `yJo8zrHbjYq9n6Ba` | Webhook → IF → Gmail → Notion |
| Health Score Sync | `zy96HsTTxBhSO1g0` | Schedule → HubSpot → Google Sheet |
| Access Provisioning | `j9OdtE4MKHI8GshO` | Sub-workflow: Okta(HTTP) → Jira → Slack #it-ops |
| Incident Triage Agent | `0keCnAccTAGdBKm3` | Webhook → Agent + Jira/Slack tools |
| Employee Offboarding | `ni5Xo0B8Aw9RNbD7` | Form → **calls** Access Provisioning (IT SOP head) → Notion |

> To point the **app** at this instance instead of fixtures: set `N8N_BASE_URL=https://n8n-dnzu.srv1448714.hstgr.cloud`
> and `N8N_API_KEY=<key>` in `.env`, then `curl -XPOST /api/sync`. SOP edges + blast radius derive from the
> workflow JSON so they'd work live; the brief's health needs real executions, so keep fixtures for the demo.

---

## Full demo run order (~8 min) + reset
1. **Pre-flight smoke** (5 checks above) — do this 10 min before, not live.
2. Run the **★ Golden path** table above, steps 1–8.
3. Close on Slide 10 → 12.

**Reset between rehearsals**
- Re-run `pnpm setup:demo` to re-ensure channels.
- Clear owner assignments / renames from the Registry & SOP UI if you want a clean "nothing pre-classified" start (setup-demo deliberately leaves owners unassigned).
- Delete test Linear issues created by O-9.

**Known demo footguns**
- Bot not in the channel → no post. Invite it everywhere first.
- Interactivity/events need the **public** prod URL (`vercel.app`); localhost won't receive Slack callbacks unless tunneled. Rehearse Slack-inbound demos against the deployed app.
- Crons are daily on Hobby — always trigger them by `curl` live, don't wait.
