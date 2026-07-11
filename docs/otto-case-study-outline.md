# Case Study: n8n Otto — Final Slide Structure

> Making workflow ops legible — from a flat list of automations to an owned, understood, alive system.

**Deck = 12 slides, 5 sections.** Slides 7–9 are the feature slides and map 1:1 to
`docs/qa-demo-plan.md` (Slide 7 = Briefs, Slide 8 = Ownership, Slide 9 = SOP groups).
The live demo runs off the **golden path** in that plan — one continuous story, not three disconnected clicks.

---

## Section 1 — The Problem (Three Pillars)

### Slide 1 · Title
- **n8n Otto: Making Workflow Ops Legible**
- Subtitle: from a flat list of automations to an owned, understood, alive system
- One line under the title: *"An AI co-worker that lives in Slack and operates your n8n estate."*

### Slide 2 · The Three Pillars & Big Questions
Each pillar = a question users can't answer today.

| Pillar | Big Question | Answer today |
|--------|--------------|--------------|
| **Visibility** | "What ran, what broke, and what needs me *right now*?" | nobody knows |
| **Ownership** | "Who is responsible when this workflow fails?" | nobody knows |
| **Relationship** | "Which workflows belong together — what *process* is this?" | nobody knows |

- Punchline: all three answers are "nobody knows." That's the gap Otto closes.

---

## Section 2 — Design Thinking (My Process)

### Slide 3 · How I Got Here — 5 Whys
- **Problem:** *"Workflows fail silently."*
- Why? No one watches execution tables.
- Why? Watching them is manual + noisy.
- Why? Logs show data, not meaning.
- Why? No owner is accountable for any single workflow.
- Why? Workflows were never modeled as *owned processes* — just scripts.
- **Root cause:** n8n treats automations as isolated jobs, not an operated system.

### Slide 4 · First Principles → Features
What must be true, stripped to fundamentals. Each maps 1:1 to a feature.

| Principle | Becomes |
|-----------|---------|
| Ops needs **meaning**, not raw logs → *summarize, don't dump* | Briefs |
| Every failure needs a **destination** → *ownership = routing* | Slack channel ownership |
| A workflow is rarely alone → *processes, not parts* | SOP groups |
| Answers should live **where work happens** → *Slack, not a new dashboard* | NL query in Slack |

### Slide 5 · Problem → Solution (at a glance)
| Problem | Solution |
|---------|----------|
| Silent failures, log overload | **Briefs** (summary + ranked issues) |
| No accountability | **Slack-channel ownership** + Linear handoff |
| Flat, unrelated list | **SOP groups** (deterministic + AI-explained) |
| Answers hard to reach | **@Otto NL query** in Slack |

---

## Section 3 — Product References (Why Slack-Native Wins)

### Slide 6 · The Pattern: Sync to Where Teams Already Are
- **Linear Agent** — issues, updates, triage pushed into Slack.
- **Claude in Slack (@-tag)** — ask an AI teammate inline, answered in-thread.
- **Viktor.ai** — ops/incident intelligence surfaced directly in Slack.
- **Common thread:** the winning move isn't another dashboard — it's meeting users in Slack.
- **Insight:** n8n has no such layer. Otto brings this proven pattern to workflow automation —
  exactly what **enterprises** need: routing, accountability, auditability, in their existing comms hub.

---

## Section 4 — The Features (3 slides + live demo)

> Live-demo thread: the **Refund Review Agent is failing** (6× since 14:10). We follow that one
> failure from *notice* → *route + ticket* → *understand its blast radius* across all three features.

### Slide 7 · Feature 1 — Visibility via Briefs
- Otto (AI co-worker) reads runs → writes a plain-language **brief**: summary + ranked issues.
- Web `/brief`: ranked "needs attention now" cards; healthy/failing counts; per-card *why + severity + owner*.
- One click **Send to Slack** → the brief lands where the team already works.
- **Demo beat:** "3 healthy · 1 failing — **Refund Review Agent errored 6× since 14:10.**" → Send to Slack.

### Slide 8 · Feature 2 — Ownership via Slack Channels
- Assign each workflow → a Slack channel (`/registry` picker lists **live** channels). Ownership = routing.
- That channel then receives: the daily brief, real-time attention alerts, **and** SOP suggestions.
- Routing is **per-workflow**: the Refund failure goes to #support-ops, the Incident Triage failure to #it-ops — automatically, no rules to maintain.
- Failure → owner → **Linear ticket** (confirm-gated in Slack, owner + blast radius auto-attached) — never leaving Slack.
- **Demo beat:** assign **Refund Review Agent → #support-ops** → live alert lands there → `@Otto open a Linear ticket` → **Confirm** → issue link. (Second failure, Incident Triage → #it-ops, shows routing is automatic.)

### Slide 9 · Feature 3 — Relationship via SOP Groups
- Otto groups workflows by SOP two ways:
  - **Deterministic groups** — rule-based, auditable, repeatable: `executeWorkflow`/`toolWorkflow` call edges + **shared data sources** (e.g. Sync YouTube + Sync LinkedIn share one Google Sheet) + shared credentials.
  - **AI on top** — Otto *explains why* a cluster is one SOP (reasons over the deterministic facts, doesn't invent) and writes the end-to-end process doc.
- **Slack SOP suggestions:** Otto proposes clusters into the channel; **accept / dismiss** inline.
- `/map` two modes (deterministic graph ↔ SOP board); SOP detail = members + end-to-end health + owners.
- Three auto-detected SOPs in the estate: **Refund SOP** (Refund Review Agent → Refund Execution — failing head), **Customer Onboarding SOP**, **IT Offboarding SOP**.
- **Demo beat:** SOP board → **Refund SOP** (the *same* failing agent from Slide 7, now a process with a red head step) → **"explain why"** → `@Otto what breaks if we rotate the Stripe key?` → blast radius = **4 workflows**. *"Auditable, deterministic — same answer every time."*

> **Bonus — NL query** (fold into Slide 8 or its own slide): `@Otto which workflows failed this week?`,
> `who owns the Refund Agent?`, `what's our estate worth?` — answered in-channel, every fact sourced from a tool over the store.

---

## Section 5 — Future & Close

### Slide 10 · What's Next
- **Auto-remediation** — Otto retries/patches with approval-in-Slack, not just suggests.
- **Root-cause chaining** — link a failure to upstream workflows in the same SOP.
- **SLA & health scoring** — per-workflow and per-SOP reliability, trended.
- **Predictive alerts** — flag drift/anomalies before hard failure.
- **Self-improving SOPs** — Otto refines generated SOPs as workflows change.
- **Multi-channel escalation** — page on-call if an issue isn't acked in Slack.
- **Cross-tool ownership** — extend the model beyond n8n (Zapier, Make, internal jobs).

### Slide 11 · Architecture (1 slide, credibility)
- n8n API (or demo fixtures) → **derive** layer (classify, edges, risk, diff) → **Postgres store** → **Otto** (OpenAI + typed tools) → **surfaces**: Web (`/brief` `/registry` `/map`) + **Slack** (events, interactivity, crons).
- Every Otto answer = a **typed tool over the store**. No hallucinated workflow facts. Deterministic grouping is auditable.

### Slide 12 · Close
- Recap: three pillars → three features, Slack-native, enterprise-ready.
- **"Otto makes n8n an *operated system*, not a pile of scripts."**
