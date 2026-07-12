# Otto — Demo Runbook

Everything needed to make the three Slack surfaces work live: **proactive pings**,
**reactive multi-turn asks**, and **free-form questions**. Code is done; this
covers the Slack config + data prep + trigger commands.

> Set once. `$APP` = your deployed base URL (APP_BASE_URL). `$SECRET` = CRON_SECRET.

---

## 0. What changed in code (context)

- **Proactive always lands:** brief / breakage-alert / SOP-suggestion / escalation
  now fall back to `SLACK_MASTER_CHANNEL_ID` when a workflow has no owner channel.
  Previously they silently no-op'd.
- **Untagged multi-turn:** Otto now answers un-tagged replies in any thread it's
  already part of (posted the brief/alert, was mentioned, or answered a button).
  Requires the Slack settings in §1.
- **Button outcomes thread back:** clicking a card button (create ticket, confirm
  owner, create SOP…) now posts the result *into the thread* instead of a private
  ephemeral — so follow-ups have context and it reads as a live coworker.
- **New free-form tools:** `get_attention_items` ("what needs attention / what did
  the brief say") and `list_failures` ("what errored this week"). SOPs (incl.
  hand-authored ones like Finance) are already answerable.

---

## 1. Slack app config — REQUIRED for untagged replies

In api.slack.com/apps → your app:

1. **Event Subscriptions → Subscribe to bot events** — add (keep `app_mention`):
   - `message.channels` (untagged replies in public channels)
   - `message.groups` (untagged replies in private channels)
2. **OAuth & Permissions → Bot Token Scopes** — ensure present:
   - `channels:history`, `groups:history` (read thread replies)
   - `chat:write`, `reactions:write`, `app_mentions:read` (already used)
3. **Reinstall the app** to the workspace after changing scopes.
4. **Invite the bot** to every channel you'll demo in (incl. the master channel):
   `/invite @n8n-otto`.

Without step 1–2 Otto only answers when re-tagged (still works, just less magical).

---

## 2. Env checklist

| Var | Why | Status |
|-----|-----|--------|
| `SLACK_MASTER_CHANNEL_ID` | Catch-all channel so proactive always lands | must be a **real channel id the bot is in** |
| `SLACK_SUGGESTIONS_CHANNEL` | Optional dedicated SOP-suggestion channel | optional (falls back to master) |
| `OPENAI_API_KEY`, `OTTO_MODEL` | Otto's brain + brief narration | required |
| `N8N_BASE_URL`, `N8N_API_KEY` | Live estate (else demo fixtures) | set = live |
| `LINEAR_API_KEY`, `LINEAR_TEAM_ID` | "Create ticket" button | required for that beat |
| `CRON_SECRET` | Protects + authenticates cron triggers | set |

---

## 3. Data prep (so there's something to say)

Run `pnpm setup:demo` first — it ensures the demo channels exist. Then:

1. **Ownership + routing.** In `/registry`, assign **at least one** workflow an
   owner **with a Slack channel** (e.g. Refund Review Agent → #support-ops).
   Everything unowned now routes to the master channel automatically.
2. **A failing workflow** (for the breakage alert + `list_failures`): the incident
   card needs **≥3 failed executions** for one workflow inside the window. On the
   live n8n instance, trigger a workflow to fail 3×, or point at a workflow that
   already has failures. (Demo fixtures already include a failing agent.)
3. **An unassigned cluster** (for the SOP suggestion): two workflows linked by an
   `executeWorkflow`/`toolWorkflow` call **or** a shared data source, **not yet**
   in an SOP. If everything is already in an SOP, no suggestion is generated.
4. **Finance SOP** already authored → ask Otto "what SOPs do we have?" to confirm
   it shows up.

---

## 4. Trigger the proactive cases on demand

Crons run daily; for a live demo hit them directly:

```bash
# Case 1 — Daily brief (also available as the "Send to Slack" button on /brief)
curl -X POST "$APP/api/slack/brief"
# or the cron form:
curl -H "Authorization: Bearer $SECRET" "$APP/api/cron/brief"

# Case 2 — Real-time breakage alert
curl -H "Authorization: Bearer $SECRET" "$APP/api/cron/notify"

# Case 3 — SOP suggestion
curl -H "Authorization: Bearer $SECRET" "$APP/api/cron/suggestions"

# Bonus — Escalate unacked high-severity items
curl -H "Authorization: Bearer $SECRET" "$APP/api/cron/escalate"
```

**Re-running notify/suggestions:** both dedupe (a posted item won't repost). To
demo again, either let the condition resolve then recur, or clear state:
- notify: delete the item's row from `BriefNotification`.
- suggestions: delete the row from `SopSuggestionState`.

---

## 5. Reactive + free-form demo script (golden path)

1. Trigger the **brief** (§4). It lands in the owner channel (or master).
2. In that thread, **without tagging**, reply: *"which of these is worst?"* →
   Otto answers in-thread (untagged multi-turn). Follow up: *"who owns it?"*,
   *"what breaks if it fails?"* — all untagged.
3. Trigger the **breakage alert**. In its thread: *"@Otto open a Linear ticket"* →
   click **Create ticket** → the ticket link posts **in-thread** → follow up
   untagged: *"what's its blast radius?"*.
4. Trigger the **SOP suggestion**. Click **Create SOP** → confirmation threads
   back → ask untagged: *"is that process healthy?"*.
5. **Free-form** anywhere you tag `@Otto`:
   - *"what needs attention?"* → `get_attention_items`
   - *"what errored this week?"* → `list_failures`
   - *"what SOPs do we have?" / "is the finance SOP healthy?"* → SOP tools
   - *"who can issue refunds?" / "what's our estate worth?" / "what breaks if we
     rotate the Stripe key?"* → capability / ledger / credential tools

---

## 6. Fast pre-demo smoke test

- [ ] `pnpm test` green, `pnpm build` clean.
- [ ] Bot is a member of every demo channel + the master channel.
- [ ] `SLACK_MASTER_CHANNEL_ID` resolves to a channel you can see.
- [ ] One owner+channel assigned; one workflow failing ≥3×; one unassigned cluster.
- [ ] `curl -X POST "$APP/api/slack/brief"` posts a brief.
- [ ] Untagged reply in that thread gets an answer (confirms §1 is live).
- [ ] `@Otto what needs attention?` and `@Otto what errored this week?` both answer.
