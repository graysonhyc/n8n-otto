# Otto — Slack Demo, One Story

One continuous Slack conversation. You're a **new content-ops hire** who inherited an
n8n estate you didn't build. You ask Otto the questions a new owner actually has —
and Visibility, Ownership and Relationship fall out naturally, without ever naming
them. It ends with you breaking **Sync Youtube Content Database** live, and tomorrow's
brief catching your mistake.

> Companion: `otto-demo-runbook.md` (setup) and `otto-demo-story.md` (the older,
> fixtures-based Refund version — **do not mix them; that estate isn't live**).

---

## The live estate (know this cold)

- **Active + running:** *Sync Youtube Content Database*, *Sync Linked Content Database*.
  Both green (3 runs/day, synthetic history). These are the estate's heartbeat.
- **The shared spine:** both write the **"Content Calendar & Database"** Google Sheet.
  Sync Youtube fills the **Youtube** tab (video rows + thumbnails to Drive + transcripts
  to Drive via SerpApi); Sync Linked Content fills its side. **This shared sheet is the
  blast radius.**
- **Downstream (staged, inactive):** the AI content suite — *AI Content Creator*,
  *Blog Post*, *Create Image*, *Edit Image*, *Faceless Video*, *LinkedIn Post*,
  *Search Images* — generates posts off that same content database.
- **Nothing is failing yet.** You create the only incident, live, at the end.

**Rules:** tag `@Otto` for the first question in a thread or any brand-new topic;
after that reply **untagged** in the same thread (the "coworker" beat). Otto's lines
below are the *target* answers — the names/counts/owners come from real tools, so
verify the ownership + sheet-sharing facts once before you present (see preflight).

---

## THE FLOW

### 0 — The brief lands (you don't ask; it arrives)

Fire it: `POST /api/slack/brief` (or **Send to Slack** on `/brief`). It posts unprompted.

Room sees: the estate at a glance — the two active sync workflows, **both green**,
each with an **AI-written one-liner of purpose** (not the name):
*"Pulls the YouTube channel's new videos into the Content Calendar sheet and archives
thumbnails + transcripts to Drive."*

> Say: *"Nobody asked for this. Nobody logged into n8n. The estate reported itself, in
> plain English, where the team already works."*

### 1 — orient (untagged, in the brief thread)

**You:** `i just took this over — what are the workflows i'm actually responsible for?`

> **Otto:** "Two are live and running daily: **Sync Youtube Content Database** and
> **Sync Linked Content Database**. They're the writers behind your **Content Calendar
> & Database** sheet — everything else (the AI Content Creator suite: Blog Post, Create
> Image, Faceless Video, LinkedIn Post…) generates content *off* that database. So those
> two syncs are the ones keeping the whole content operation fed."

### 2 — what does it do (untagged)

**You:** `what does Sync Youtube Content Database actually do?`

> **Otto:** "On a schedule it reads your YouTube channel, pulls every video, and
> upserts them into the **Content Calendar & Database** sheet (Youtube tab) — title,
> description, link, date. Then per video it saves the thumbnail to a Drive folder and
> fetches the transcript (via SerpApi) into a Transcripts folder, marking each row done.
> In short: it's what keeps your content database current with what you've published."

### 3 — is it healthy (untagged)

**You:** `is it healthy right now?`

> **Otto:** "Yes — green. It's run every day this window with no errors; last run
> succeeded. Same for its sibling, Sync Linked Content Database."

### 4 — who owns it (untagged) → OWNERSHIP

**You:** `if it breaks at 2am, whose problem is it?`

> **Otto:** "Right now **Sync Youtube is assigned to [team → #channel]** — that's where
> its alerts go and who gets tagged." *(If unassigned:)* "It has **no owner** — so its
> alerts fall back to the master channel and nobody's explicitly accountable. As the new
> content-ops hire, this is one you should claim."

### 5 — coverage (untagged)

**You:** `how much of the whole estate has a real owner?`

> **Otto:** "[X] of [N] workflows have a named owner ([Y]%). Owned ones route alerts to
> their team's channel; the rest fall back to master so nothing ever goes silent — but
> 'falls back to master' isn't the same as owned."

### 6 — blast radius (untagged) → RELATIONSHIP

**You:** `if Sync Youtube stops, what else is affected?`

> **Otto:** "It's not isolated. It shares the **Content Calendar & Database** sheet with
> **Sync Linked Content Database** — they co-own that database. And the whole **AI
> content suite** (AI Content Creator → Blog Post, Create Image, Faceless Video, LinkedIn
> Post) *reads* that sheet to generate posts. So if Sync Youtube stops writing, the
> YouTube side of the database goes stale and everything generating content downstream
> is working off old data — without erroring. Nobody configured that link; I inferred it
> from the shared sheet."

### 7 — shared creds (untagged)

**You:** `does it share any credentials?`

> **Otto:** "Yes — the Google account (Sheets + Drive + YouTube) and SerpApi are shared
> across the content workflows. Rotate or break the Google credential and both syncs plus
> the Drive archiving stop together."

### 8 — processes (tag; new framing) → RELATIONSHIP

**You:** `@Otto so what processes do we actually have here?`

> **Otto:** "Two, inferred from how they call and share data:
> 1. **Content Sync** — Sync Youtube + Sync Linked Content → the Content Calendar sheet.
> 2. **Content Generation** — AI Content Creator and its sub-workflows, reading that
>    sheet to produce blog posts, images and video.
> The first feeds the second. Sync Youtube is a head of the Content Sync process."

> This is the whole pitch in three answers: it **reported itself** (Visibility), it knows
> **who's accountable** (Ownership), and it **inferred the map** nobody drew (Relationship).

---

### 9 — the setup line (say it, then go break it)

> "So: Sync Youtube is green, unglamorous, and it's the writer feeding the entire content
> operation. Watch what happens when the new guy — me — goes into n8n and changes
> something he doesn't fully understand."

### 10 — break it live (in real n8n)

Open **Sync Youtube Content Database** and make a new-hire mistake. **To guarantee the
brief shows a real failure (not a silent empty run), pick one:**

- **Best (clean red error):** disconnect a mid-chain node whose output a later node still
  references by name — e.g. detach **"Get row(s) in sheet"** from the flow. Downstream
  nodes still call `$('Get row(s) in sheet')` / `$('Append or update row in sheet')`, so
  the run throws *"Referenced node is unexecuted."* Save **and publish/activate** (the
  *active* version is what the schedule runs).
- **Also reliable:** break a node's config — bad `channelId` on **"Get a channel"**, or
  point the Google Sheet node at a wrong document ID.
- **Story-literal but risky:** just disconnect **"Get many videos → Filter."** This often
  produces a *successful-but-empty* run, which may show as "ran, wrote nothing" rather
  than a red failure. Only use this if you also lean on Otto's *recent-change* detection.

Then trigger a run (manual) so it produces the failed execution before the next brief.

### 11 — next brief catches it

Fire the brief again (`POST /api/slack/brief`). Now it shows **Sync Youtube Content
Database — failing, new since yesterday**, with its purpose one-liner, digested to the
owning channel (or master).

**You (untagged):** `wasn't this green yesterday?`
> **Otto:** "Yes — it was healthy in yesterday's brief. It started failing after a change
> made [today] at [time]; first failed run [timestamp]." *(recent_changes + list_failures)*

**You (untagged):** `what am i starving by breaking this?`
> **Otto:** "The Content Calendar sheet's YouTube side stops updating. Sync Linked Content
> still writes its part, so the database is now half-stale, and the AI content suite keeps
> generating off old YouTube data. The break is silent everywhere except here."

### 12 — close

> "One workflow broke — one I'd been told about yesterday and forgot. I didn't have to
> notice it, remember what it fed, or know what else touched that sheet. The estate caught
> it overnight, told the owner in their channel, and traced what I'd starved. That's the
> pitch: governance that lives where the team already works."

Then one click into the web app (`/registry` or `/map`) to prove it's backed by a real
system of record. One click. Demote it.

---

## Question → tool (for your own reference)

| Beat | You type | Tool behind it |
|------|----------|----------------|
| 0 | *(brief auto-posts)* | brief |
| 1 | what am I responsible for? | `estate_summary` / `list_processes` |
| 2 | what does Sync Youtube do? | `get_workflow_detail` |
| 3 | is it healthy? | `get_attention_items` / `list_failures` |
| 4 | whose problem if it breaks? | `who_owns` |
| 5 | how much has an owner? | `ownership_coverage` |
| 6 | what else is affected? | `get_blast_radius` / `get_connections` |
| 7 | shared credentials? | `credential_impact` |
| 8 | what processes do we have? | `list_processes` / `process_status` |
| 11 | wasn't this green yesterday? | `recent_changes` / `list_failures` |
| 11 | what am I starving? | `get_blast_radius` / `get_similar_workflows` |

---

## Preflight (do NOT skip)

- [ ] App is pointed at the **live** n8n (`N8N_BASE_URL` + `N8N_API_KEY` set) so it reads
      the 12 real workflows — not the Refund fixtures.
- [ ] Bot invited to the demo channel + master; untagged replies work (runbook §1).
- [ ] Confirm the **owner** on Sync Youtube (beat 4) and that Otto reports **Sync Linked
      Content shares the Content Calendar sheet** (beat 6) — verify these two live before
      you present; they're the load-bearing claims.
- [ ] `POST /api/slack/brief` posts, shows both syncs green.
- [ ] Rehearse the break on a throwaway run: confirm your chosen edit produces a **red /
      failed** execution, not an empty success.
- [ ] Know how to re-run cleanly (brief re-posts; `notify` dedupes — clear its row to repeat).
