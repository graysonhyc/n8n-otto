# n8n Backoffice — Phase 1 Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js app that reads a real n8n instance and presents a business-readable Registry, per-workflow Detail (with auto + manual relationships), a proactive Brief, and a real Slack app that routes alerts/approvals/the daily brief to the owner's Slack channel.

**Architecture:** Next.js (App Router) full-stack. Server route handlers + server actions call the n8n REST API, OpenAI, and the Slack Web API. A Prisma-backed store holds data n8n doesn't own (confirmed owners, team→channel routing, manual workflow links, workflow snapshots for diffing, Slack tokens, acknowledged/dismissed items). All provider calls are server-side; the browser never sees a secret. Deployed to Vercel; demo Slack workspace with seeded channels.

**Tech Stack:** Next.js 16 (App Router, RSC) · TypeScript · Tailwind v4 · Prisma (SQLite dev / Postgres prod) · OpenAI SDK · Slack Web API + signed interactivity · Vitest for unit tests.

**Spec:** `docs/specs/2026-07-09-n8n-backoffice-phase1-design.md`

---

## Conventions

- **TDD where logic is pure/testable** (derivation, diffing, edge extraction, Slack signature verify, routing resolution). UI = build + manual verify against fixtures.
- **Fixtures first:** `test/fixtures/n8n/*.json` hold real-shaped n8n API responses (captured or hand-built from the anchor scenario). All data-layer tests run against fixtures — no live creds needed until Chunk 6.
- **Commit after every green step.** Conventional commits (`feat:`, `test:`, `chore:`).
- **No `any`.** Shared types live in `lib/n8n/types.ts` and `lib/backoffice/types.ts`.
- Run tests: `pnpm test <path>`. Run app: `pnpm dev`.

---

## File Structure

```
app/
  layout.tsx                     # root: theme, fonts, <AppShell>
  page.tsx                       # redirect → /brief
  globals.css                    # Tailwind + n8n theme tokens
  (backoffice)/
    layout.tsx                   # AppShell: icon rail + Backoffice nav
    brief/page.tsx               # Screen: Brief
    registry/page.tsx            # Screen: Registry
    workflow/[id]/page.tsx       # Screen: Detail
  api/
    sync/route.ts                # POST: re-fetch n8n + snapshot + diff
    owners/route.ts              # POST/PATCH: assign/confirm owner
    links/route.ts               # POST/DELETE: manual workflow links
    slack/
      install/route.ts           # GET: begin OAuth
      oauth/route.ts             # GET: OAuth callback → store token
      channels/route.ts          # GET: conversations.list (owner picker)
      interactivity/route.ts     # POST: Slack button actions (signed)
      brief/route.ts             # POST: send daily brief to Slack
components/
  shell/AppShell.tsx, Rail.tsx, SideNav.tsx
  registry/RegistryTable.tsx, Filters.tsx, OwnerAssign.tsx
  detail/*.tsx                   # Summary, Ownership, Relationships, AiBehaviour, Runbook
  brief/BriefCard.tsx
  ui/Pill.tsx, Chip.tsx, Button.tsx, SlackChannelPicker.tsx
lib/
  n8n/client.ts                  # REST client (server-only)
  n8n/types.ts                   # n8n entity types
  derive/classify.ts             # type/systems/trigger/health
  derive/edges.ts                # Tier A/B/C relationship extraction
  derive/registry.ts            # compose derived registry item
  diff/snapshot.ts               # snapshot + diff for change detection
  brief/build.ts                 # rules → brief items
  ai/enrich.ts                   # OpenAI: purpose, owner, risk, runbook
  ai/prompts.ts
  slack/verify.ts                # signature verification
  slack/blocks.ts                # Block Kit builders (4 message types)
  slack/post.ts                  # post + route resolution
  backoffice/store.ts            # Prisma repository (owners, links, snapshots, tokens)
  backoffice/types.ts
prisma/schema.prisma
test/fixtures/n8n/*.json
```

---

## Chunk 0: Foundation

### Task 0.1: Finish scaffold + install
**Files:** repo root
- [ ] Approve the paused native builds and complete install: `cd /Users/graysonho/Documents/GitHub/n8n-backoffice && pnpm install` then `pnpm approve-builds` (allow `sharp`, `unrs-resolver`) — or set `.npmrc` `enable-pre-post-scripts=true`.
- [ ] Verify dev server boots: `pnpm dev`, open localhost:3000, see Next default. Kill.
- [ ] Commit: `chore: complete Next.js scaffold`.

### Task 0.2: Theme tokens + globals
**Files:** Create `app/globals.css` (n8n dark + coral tokens from the mockup: `--bg #0d0d11`, `--panel #16161c`, `--border #2a2a34`, `--accent #ea4b71`, semantic red/amber/green/violet). Define CSS variables + Tailwind v4 `@theme` mapping.
- [ ] Add tokens; set body background/gradients.
- [ ] Verify a test page renders with dark theme.
- [ ] Commit: `feat: n8n dark theme tokens`.

### Task 0.3: App shell + nav
**Files:** Create `app/(backoffice)/layout.tsx`, `components/shell/{AppShell,Rail,SideNav}.tsx`, `app/page.tsx` (redirect to `/brief`).
- [ ] Build icon rail + Backoffice SideNav (Brief/Registry — Responsibility/Map/Change grayed "soon"). Match mockup chrome.
- [ ] Verify `/brief`, `/registry` render inside shell (empty states).
- [ ] Commit: `feat: app shell + backoffice nav`.

### Task 0.4: Prisma store scaffold
**Files:** Create `prisma/schema.prisma`, `lib/backoffice/store.ts`, `lib/backoffice/types.ts`.

Schema models: `OwnerAssignment { workflowId, team, slackChannelId, slackChannelName, escalationChannelId?, confirmed, reasoning?, source }`, `WorkflowLink { fromId, toId, relation, source }`, `WorkflowSnapshot { workflowId, hash, json, capturedAt }`, `SlackInstall { teamId, botToken, botUserId }`, `BriefItemState { key, status }` (dismissed/acknowledged).
- [ ] Write schema; `pnpm prisma migrate dev --name init` (SQLite `dev.db`).
- [ ] `store.ts`: typed repository fns (get/set owner, add/remove link, get/put snapshot, get/set slack install, brief state). One responsibility each.
- [ ] Commit: `feat: prisma backoffice store`.

---

## Chunk 1: n8n data layer (TDD)

### Task 1.1: n8n types + fixtures
**Files:** Create `lib/n8n/types.ts`, `test/fixtures/n8n/{workflows,executions,credentials,projects,users}.json`.
- [ ] Define types: `N8nWorkflow` (id, name, active, nodes[], connections, tags, ...), `N8nNode` (name, type, parameters, credentials), `N8nExecution`, `N8nCredential`, `N8nProject`, `N8nUser`.
- [ ] Build fixtures for the anchor scenario: Refund Review Agent (LangChain agent node + `ai_tool` connections to Zendesk/Stripe/Gmail tools, GPT-4.1), Customer Onboarding (Stripe trigger → HubSpot → Slack → Execute Workflow → Welcome Email Agent), Lead Routing, Revenue Report Agent, PTO Approval Bot. Include a shared credential across ≥2 workflows.
- [ ] Commit: `test: n8n types + anchor-scenario fixtures`.

### Task 1.2: Classify (TDD)
**Files:** Create `lib/derive/classify.ts`, `test/derive/classify.test.ts`.
- [ ] **Test first:** given the Refund Review Agent fixture → `type === 'ai-agent-tools'`, `usesAI === true`, `systems` includes Zendesk/Stripe/Gmail, `trigger.kind === 'webhook'|'sub-workflow'` as modeled. Given Customer Onboarding → `type === 'deterministic'`, `trigger.kind === 'webhook'` (Stripe), systems HubSpot/Slack/Stripe.
- [ ] Run → fails.
- [ ] Implement: node-type maps (LangChain agent/LLM node type ids → AI; tool connections → tool access; wait/approval nodes → human-in-loop), credential-type→system map, trigger detection from trigger node type.
- [ ] Run → passes. Commit `feat: workflow classification`.

### Task 1.3: Edge extraction (TDD)
**Files:** Create `lib/derive/edges.ts`, `test/derive/edges.test.ts`.
- [ ] **Test first:** Customer Onboarding yields a Tier-A `workflow→workflow` edge to Welcome Email Agent (from Execute Workflow node); Refund Review Agent yields Tier-A `agent→tool` edges; two workflows sharing a credential yield a `workflow↔credential` shared edge. Tier-B (same Slack channel) yields a dashed `workflow→system` edge.
- [ ] Run → fails. Implement extraction per §4 table. Return `{ from, to, kind, tier }[]`.
- [ ] Run → passes. Commit `feat: relationship edge extraction`.

### Task 1.4: n8n client (server-only)
**Files:** Create `lib/n8n/client.ts`.
- [ ] `createN8nClient(baseUrl, apiKey)` with `listWorkflows/getWorkflow/listExecutions/listCredentials/listProjects/listUsers`, `X-N8N-API-KEY` header, pagination, typed returns. Mark `import 'server-only'`.
- [ ] Light test with a mocked `fetch` for header + pagination. Commit `feat: n8n REST client`.

### Task 1.5: Registry composition
**Files:** Create `lib/derive/registry.ts`, `test/derive/registry.test.ts`.
- [ ] Compose per-workflow `RegistryItem` (classify + health from executions + owner from store + risk label). **Test** the risk-label rules (prod-active + AI-tools + no owner → higher risk). Commit `feat: registry composition`.

---

## Chunk 2: Registry + Detail screens

### Task 2.1: Registry page + table
**Files:** `app/(backoffice)/registry/page.tsx` (RSC: sync + derive), `components/registry/{RegistryTable,Filters}.tsx`, `components/ui/{Pill,Chip}.tsx`.
- [ ] RSC fetches derived registry (fixture-backed until Chunk 6). Render table matching mockup columns; Filters as client component (client-side filtering).
- [ ] Verify against fixtures: 5 rows, correct pills. Commit `feat: registry table`.

### Task 2.2: Owner assign (store write, Slack picker stub)
**Files:** `components/registry/OwnerAssign.tsx`, `components/ui/SlackChannelPicker.tsx`, `app/api/owners/route.ts`.
- [ ] Inline "Assign owner": team label input + channel picker. Picker calls `/api/slack/channels` (returns `[]` + "not connected" until Chunk 4). POST writes `OwnerAssignment` to store.
- [ ] Verify assign persists + shows in row. Commit `feat: owner assignment`.

### Task 2.3: Detail page sections
**Files:** `app/(backoffice)/workflow/[id]/page.tsx`, `components/detail/{Summary,Ownership,Relationships,AiBehaviour,Runbook}.tsx`.
- [ ] Render sections from derived data. Relationships shows auto edges (from `edges.ts`) + manual links (from store), tagged. "If this breaks" from downstream edges.
- [ ] Verify Refund Review Agent detail renders full. Commit `feat: workflow detail`.

### Task 2.4: Manual links (Jira-style)
**Files:** `app/api/links/route.ts`, add "Add related workflow" to `Relationships.tsx`.
- [ ] POST creates a bidirectional `WorkflowLink` (relation enum: depends-on/triggers/duplicate-of/part-of-process/shares-data-with). DELETE removes. Show on both workflows, tagged **manual**.
- [ ] Verify add/remove reflects on both details. Commit `feat: manual workflow links`.

### Task 2.5: AI enrichment
**Files:** `lib/ai/{enrich,prompts}.ts`, wire into Detail + Registry (cached to store).
- [ ] `enrich(workflow)` → `{ businessPurpose, input, output, ownerGuess+reasoning, runbook }` via OpenAI SDK (`gpt-4.1`), server-side, results cached. Prompts in `prompts.ts`. Degrade gracefully if `OPENAI_API_KEY` unset (show "AI summary unavailable").
- [ ] Verify with key set on one workflow. Commit `feat: OpenAI enrichment`.

---

## Chunk 3: Brief + change detection

### Task 3.1: Snapshot + diff (TDD)
**Files:** `lib/diff/snapshot.ts`, `test/diff/snapshot.test.ts`.
- [ ] **Test first:** snapshot captures prompt text, model, tool connections, trigger, active, credentials → stable `hash`. Diff of "summarise" vs "recommend approve/reject" prompt yields a `prompt` change event with old/new. Model change and tool-added yield events.
- [ ] Run → fails. Implement. Run → passes. Commit `feat: workflow snapshot + diff`.

### Task 3.2: Sync endpoint
**Files:** `app/api/sync/route.ts`.
- [ ] POST: fetch workflows → for each, put snapshot, diff vs previous → persist change events. Returns summary. Called on Registry/Brief load + manual "Refresh".
- [ ] Verify diff detected across two fixture versions. Commit `feat: sync + change detection`.

### Task 3.3: Brief builder (TDD)
**Files:** `lib/brief/build.ts`, `test/brief/build.test.ts`.
- [ ] **Test first:** rules produce items — risky prompt change (from diff: summarise→decide = High), missing owner, shared-credential risk (credential used by ≥N), stale workflow w/ prod access, AI-agent w/ tools + no review. Each item: `{ severity, title, whatHappened, whyItMatters, suggestedOwner, recommendedAction, actions[] }`. Sorted by severity.
- [ ] Run → fails. Implement rules (+ AI risk phrasing via `enrich`, optional). Run → passes. Commit `feat: brief builder`.

### Task 3.4: Brief page
**Files:** `app/(backoffice)/brief/page.tsx`, `components/brief/BriefCard.tsx`, `components/ui/Button.tsx`.
- [ ] Render ranked cards (mockup styling). Actions wired to store (dismiss/acknowledge) + links. "Send to Slack" button hits `/api/slack/brief` (Chunk 4).
- [ ] Verify anchor scenario surfaces the Refund Review Agent card first. Commit `feat: brief screen`.

---

## Chunk 4: Slack app

### Task 4.1: Signature verify (TDD)
**Files:** `lib/slack/verify.ts`, `test/slack/verify.test.ts`.
- [ ] **Test first:** valid `v0=` HMAC over `v0:timestamp:body` with signing secret → true; tampered body/stale timestamp → false.
- [ ] Run → fails. Implement (timing-safe compare, 5-min window). Run → passes. Commit `feat: slack signature verification`.

### Task 4.2: OAuth install + callback
**Files:** `app/api/slack/{install,oauth}/route.ts`.
- [ ] `install` → redirect to Slack authorize (scopes `channels:read,groups:read,chat:write,commands`). `oauth` → exchange code, store `SlackInstall` (bot token). Show connected state in UI.
- [ ] Verify against a real Slack app (Chunk 6 wires creds). Commit `feat: slack oauth`.

### Task 4.3: Channels list
**Files:** `app/api/slack/channels/route.ts`.
- [ ] GET → `conversations.list` (public+private the bot can see); return `{id,name,isMember}`. Powers `SlackChannelPicker`; flag `isMember:false` ("invite bot to post").
- [ ] Verify picker populates from a real workspace. Commit `feat: slack channels for owner picker`.

### Task 4.4: Block Kit builders + routing
**Files:** `lib/slack/blocks.ts`, `lib/slack/post.ts`.
- [ ] `blocks.ts`: builders for the 4 messages (health alert, change/approval, ownership check, daily brief) matching the mockup, with `action_id`s + `value` payloads (workflowId, itemKey).
- [ ] `post.ts`: `resolveChannel(workflowId)` from OwnerAssignment → `postMessage`. **Unit test** route resolution (owner team → channel; unassigned → master `#n8n-backoffice`).
- [ ] Commit `feat: slack block kit + routing`.

### Task 4.5: Send brief + health alerts
**Files:** `app/api/slack/brief/route.ts`; extend `/api/sync` to emit health alerts.
- [ ] `brief` POST → post Brief to master channel + per-team slices. Sync: on failure-threshold (N fails/M min from executions) → post health alert to owner channel.
- [ ] Verify brief lands in a real channel. Commit `feat: send brief + health alerts to slack`.

### Task 4.6: Interactivity endpoint
**Files:** `app/api/slack/interactivity/route.ts`.
- [ ] POST (signature-verified): handle Approve/Request changes/Rollback, Confirm/Reassign owner, Mark acknowledged, Create Linear ticket (stub or real if Linear creds). Write decisions back to store; respond with `response_action`/message update.
- [ ] Verify a real button click updates the store + message. Commit `feat: slack interactivity`.

---

## Chunk 5: Demo setup + deploy

### Task 5.1: Env + config docs
**Files:** `.env.example`, `README.md`.
- [ ] Document `N8N_BASE_URL`, `N8N_API_KEY`, `OPENAI_API_KEY`, `SLACK_*`, `DATABASE_URL`. Setup steps.
- [ ] Commit `docs: env + setup`.

### Task 5.2: Slack demo workspace + channels
**Files:** `scripts/setup-slack-demo.ts`.
- [ ] Script (or documented steps): create/verify channels `#n8n-backoffice,#support-ops,#finance,#people-ops,#revops,#sales-ops,#cs-alerts`, invite the bot, seed team→channel routing (Refund Review Agent→#support-ops, Customer Onboarding→#revops).
- [ ] Commit `chore: slack demo setup`.

### Task 5.3: Wire real creds + swap Postgres
**Files:** `prisma/schema.prisma` (Postgres provider for prod), env.
- [ ] Point n8n client at the provided instance; run `/api/sync`; confirm real Registry. Switch Prisma to Postgres (Neon) for Vercel. Verify parity vs fixtures.
- [ ] Commit `chore: production datasource + live n8n`.

### Task 5.4: Deploy to Vercel
- [ ] `vercel` deploy; set env vars; set Slack redirect + interactivity/events URLs to the Vercel domain; reinstall Slack app.
- [ ] End-to-end demo pass: detect Refund Review Agent prompt change → Brief card → Detail diff + risk → owner → Slack approval to `#support-ops` → runbook.
- [ ] Commit `chore: vercel deploy`.

---

## Open dependencies (need from user before Chunk 6/5.3)
- n8n `N8N_BASE_URL` + `N8N_API_KEY` (populated instance).
- `OPENAI_API_KEY`.
- Slack app: `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET` + a workspace to install into.

## Testing summary
- Unit (Vitest, fixture-backed): classify, edges, registry risk rules, snapshot/diff, brief rules, slack verify, route resolution.
- Manual verify: each screen against fixtures; Slack flows against a real workspace in Chunk 4/5.
