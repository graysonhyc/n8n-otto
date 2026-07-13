# The Demo Story — One Incident, Three Wins

**Thesis for the interviewer:** *A back-office automation estate has no owner, no
map, and no memory. When something breaks, nobody knows what it did, who owns it,
or what else it takes down. Otto is the governance layer that already lives in
Slack — it sees the estate, routes the problem to a human, and knows the blast
radius before anyone asks.*

Don't tour features. Tell **one story**: the head of the company's money-moving
Refund process goes down, and watch the whole loop close in Slack without a single
person hunting through n8n.

The three problems are not three demos. They are three **beats of one incident.**

---

## The anchor: the Refund SOP

Everything keys off one real cluster in the estate:

```
Zendesk ticket ──▶ Refund Review Agent  ──(executeWorkflow)──▶  Refund Execution
                    (GPT-4.1, decides)                          (Issues Stripe refund)
                    owner: Support Ops                          owner: Billing Ops
                    #support-ops                                #billing-ops
                          │                                            │
                          └────────── shared credential: Stripe ───────┘
                                       (also: Dunning Retry, Customer Onboarding)
```

- **Refund Review Agent** failed **6 times yesterday, 14:10–14:15** (real seeded
  data). It's the **head** of the process — the part that decides whether to
  approve — and it's the part that's down.
- It hands off to **Refund Execution** via an `executeWorkflow` call → the two are
  auto-detected as **one SOP** (nobody drew that line; Otto inferred it).
- Both touch the **Stripe** credential — shared with **Dunning Retry** and
  **Customer Onboarding**. That's the blast radius.

One failure. A process, an owner handoff, and a shared-credential blast radius all
hang off it. That's why it carries all three wins.

> **Live-instance note:** if you demo on the live n8n (not fixtures), the seeded
> failure is **Sync Linked Content Database** (fails last 2 days; healthy sibling
> **Sync Youtube** keeps running). Same story shape — failing head in a live
> process — but the Refund SOP fixture is richer (money + two owners + blast
> radius), so prefer fixtures for the WOW cut.

---

## Cold open (15 seconds) — set the pain, don't explain the product

Say this before you touch anything:

> "This company runs ~18 automations across 6 teams. Nobody can tell you what half
> of them do, who owns them, or what breaks if one dies. That's normal — and it's
> the problem. Watch what happens when one breaks. I'm not going to open n8n once."

Then go to Slack. **Slack is the stage.** The web app is the system of record you
click into once, to prove it's real — not the star.

---

## Beat 1 — VISIBILITY: the estate reports itself

**Trigger the daily brief** (`POST /api/slack/brief`, or the "Send to Slack"
button on `/brief`). It lands in the channel.

What the interviewer sees, unprompted:
- Yesterday's estate at a glance: N runs, mostly green, **one workflow failing —
  Refund Review Agent, 6 errors.**
- Each line has an **AI-written one-liner of what the workflow is for** — not the
  name, the *purpose*. "Decides whether to approve refunds and drafts the customer
  reply."

Then, in-thread, **without tagging Otto**, type:

> "which of these is worst?"

Otto answers in-thread: the Refund failure — because it's the head of a
money-moving process, not a cosmetic job.

**The win, stated:** *"Nobody asked for a report. Nobody logged into n8n. The
estate told the team what happened and what matters — in plain English, where they
already work."* That's Visibility: AI-summarised purpose + real-time health, timely
and digestible, on Slack.

---

## Beat 2 — OWNERSHIP: the problem finds its human

**Trigger the breakage alert** (`GET /api/cron/notify`). An incident card posts
**to the owner's channel** (#support-ops), tagging the **owner** — because Refund
Review Agent has an assigned Team Owner + channel. (Anything unowned falls back to
the master channel — say that out loud: *"no automation gets to be an orphan."*)

In that thread, tag Otto:

> "@Otto open a Linear ticket"

Click **Create ticket** → the ticket link posts **back into the thread** (not a
private ephemeral). It reads like a coworker did it.

**The win, stated:** *"The failure didn't sit in a dashboard waiting to be noticed.
It went to the one person accountable, in their channel, with a ticket already
drafted. Every workflow has an owner; every break becomes someone's job in
seconds."* That's Ownership: Team Owner per workflow + proactive break/change
comms.

> Contrast for the interviewer: "In raw n8n, this failure is a red dot on a screen
> nobody has open."

---

## Beat 3 — RELATIONSHIP: Otto knows the blast radius

Still in the incident thread, ask — **untagged**:

> "what breaks if this fails?"

Otto answers with the two relationships it inferred, no human ever configured:

1. **The SOP:** "Refund Review Agent is the head of the **Refund SOP** — it hands
   off to **Refund Execution**, which issues the actual Stripe refund. Head is
   down, so refunds aren't being decided *or* paid." (auto-detected from the
   `executeWorkflow` edge.)
2. **Shared credential:** "Both use the **Stripe** credential — also used by
   **Dunning Retry** and **Customer Onboarding**. If you rotate or lose that key,
   4 workflows across Billing, Support and RevOps go down together."

Optional kicker — tag Otto anywhere:

> "@Otto what breaks if we rotate the Stripe key?"

Same blast-radius answer, framed as a proactive question. Shows it's not scripted
to the incident — it's a real model of the estate.

**The win, stated:** *"Nobody drew this map. Otto inferred the process and the
shared-credential blast radius from the workflow graph. That's the difference
between a list of automations and an understood system."* That's Relationship:
grouping into SOPs + shared data-source/credential highlights.

---

## Close (10 seconds) — land the one line

> "One workflow broke. Without opening n8n: the team knew within the hour, the
> owner got it with a ticket drafted, and Otto flagged the two other systems at
> risk from the same key. The back-office ran itself. That's the whole pitch —
> **governance that lives where the team already is.**"

Then, only now, click into the web app once: show `/registry` (owners) or the SOP
view — *"and it's all backed by a real system of record."* One click. Demote it.

---

## Why this passes the interview

- **It's a narrative, not a feature list.** One incident, beginning to end. The
  three "BIG wins" are felt as beats, not read off a slide.
- **Every claim is shown, not asserted.** Failing head → real seeded data. Owner
  routing → real channel + tag. Blast radius → real inferred graph.
- **The differentiator leads.** A dashboard is table stakes; every tool has one.
  *Proactive, in-Slack, knows-the-blast-radius* is the thing n8n doesn't ship.
- **It answers the unspoken question** — "why not just use n8n's built-in error
  workflow?" — because n8n tells you *a node failed*; Otto tells you *what it did,
  who owns it, and what else is at risk.*

---

## Run sheet (pin this next to you)

| # | Beat | Action | Otto surface |
|---|------|--------|--------------|
| 0 | Cold open | Say the pain. Open Slack. | — |
| 1 | Visibility | `POST /api/slack/brief`; untagged "which is worst?" | brief + multi-turn |
| 2 | Ownership | `GET /api/cron/notify`; "@Otto open a Linear ticket" → Create ticket | incident card + button-threads-back |
| 3 | Relationship | untagged "what breaks if this fails?"; "@Otto what breaks if we rotate Stripe?" | blast-radius tools |
| 4 | Close | one line; one click into `/registry` | web app as system of record |

**Pre-flight (from otto-demo-runbook.md):** bot invited to #support-ops + master;
Refund Review Agent has owner + channel; the 6 seeded failures are in-window; brief
posts; untagged replies answer. Dedupe: to re-run notify, delete the item's
`BriefNotification` row.
```
