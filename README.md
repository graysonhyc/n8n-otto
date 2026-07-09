# n8n Backoffice

The operational control room for enterprise automations and AI agents. Reads a
real n8n instance and turns raw workflows into a business-readable **Registry**,
per-workflow **Detail** (with auto + manual relationships), a proactive
**Brief**, and a real **Slack app** that routes alerts/approvals/the daily brief
to each workflow owner's Slack channel.

> Complements n8n Insights. Insights tells you *how workflows perform*; Backoffice
> tells you *what they mean, who owns them, what they depend on, and what to do
> when something changes.*

## How it works

```
n8n REST API ─▶ derive (classify, edges, health) ─▶ Claude enrich ─▶ store ─▶ 6 screens + Slack
```

- **Real data.** Workflows, executions, credentials are read live via `/api/v1`.
  With no `N8N_*` env set, the app runs on bundled demo fixtures (the Refund
  Review Agent scenario) so everything is explorable immediately.
- **Derivation.** Node/connection parsing yields workflow type (deterministic /
  AI-assisted / AI-agent-with-tools / human-in-loop), systems touched, trigger,
  and relationship edges (Tier A exact, Tier B/C heuristic).
- **Change detection.** Each sync snapshots change-relevant fields and diffs
  against the last snapshot to surface prompt/model/tool/trigger changes.
- **AI recommends, humans confirm.** Claude drafts business purpose, owner
  inference, change-risk and runbooks; every AI field is labelled and editable.

## Quickstart

```bash
pnpm install
cp .env.example .env.local        # fill in what you have; all are optional to start
pnpm prisma migrate dev           # creates the local SQLite store
pnpm dev                          # http://localhost:3000  → redirects to /brief
```

Runs on demo data out of the box. Add `N8N_BASE_URL` + `N8N_API_KEY` to read a
real instance; add `ANTHROPIC_API_KEY` for AI summaries; add the `SLACK_*` vars
to enable the Slack app.

## Slack app setup

1. Create a Slack app (from scratch). Add **Bot Token Scopes**: `channels:read`,
   `groups:read`, `chat:write`, `commands`.
2. **OAuth redirect URL:** `${APP_BASE_URL}/api/slack/oauth`
3. **Interactivity request URL:** `${APP_BASE_URL}/api/slack/interactivity`
4. Copy Client ID / Client Secret / Signing Secret into `.env.local`.
5. Visit `/api/slack/install` (or the "Connect Slack" link in the Registry owner
   picker) to install into your workspace.
6. Seed the demo channels + routing: `pnpm setup:demo`
   (creates `#n8n-backoffice`, `#support-ops`, `#revops`, … and maps the anchor
   workflows to them). The bot must be a member of a channel to post there.

## Deploy (Vercel)

1. Switch `prisma/schema.prisma` datasource provider to `postgresql` and set
   `DATABASE_URL` to a Postgres URL (Neon/Supabase). Run `pnpm prisma migrate deploy`.
2. Set all env vars in the Vercel project; set `APP_BASE_URL` to the deploy URL.
3. Update the Slack app's OAuth + Interactivity URLs to the deploy domain and
   reinstall.

## Tests

```bash
pnpm test        # vitest — classify, edges, registry risk, snapshot/diff, brief rules, slack verify + routing
```

## Screens

- **Brief** — ranked "needs attention now" cards; one click sends them to Slack.
- **Registry** — inventory with filters; inline owner assignment from live Slack channels.
- **Detail** — summary, ownership + reasoning, relationships (auto + manual Jira-style links), AI behaviour, runbook.

Responsibility Center, Change Memory, and the full Dependency Map + SOP overlay
are planned for later phases.
