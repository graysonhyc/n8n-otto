# Slack Coworker — Bidirectional n8n Backoffice Agent — Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one-way Slack app (brief push + alert push) into a bidirectional coworker: users `@mention` the bot in any channel/thread and it answers questions about the n8n estate and takes ownership actions (file a Linear ticket, assign owner) — every answer/action carrying **owner + blast radius**.

> **STATUS (2026-07-10): SHIPPED — all phases complete.** Phase 0 (foundation), Phase 1 (remediation), Phase 2 (Ask-your-estate depth), Phase 3 (process relationship), plus ownership-coverage + credential change-risk + SLA escalation. 100 tests green, tsc + production build clean, on branch `feat/slack-coworker`. Task 1.5 (n8n replay) resolved as a deep-link — the public REST API has no execution-retry endpoint. Remaining to run live: deploy + update the Slack app from the manifest + set env keys.

**Product feel — "Claude tag":** The coworker must feel like Claude-in-Slack. You `@mention` **Otto** in a thread; it **reads that thread** (the last ~50 messages — mirroring Claude's thread scope), then answers conversationally **in-thread**. The killer case: a user @mentions Otto *inside an alert thread Otto itself posted*, and it answers with owner + blast radius and offers to file a ticket — Claude-tag UX, domain superpower. Follow-ups in the same thread keep context because Otto re-reads the thread each turn (the thread IS the memory — stateless server). While working, Otto shows a visible "on it" state (a placeholder message it later edits, + an `eyes` reaction on the mention). Privacy mirrors Claude tag: only channels Otto is invited to, only the mentioned thread's context.

**Persona:** **Otto** — the n8n Backoffice coworker. Handle `@otto`. Lives only in the system prompt + Slack app display name; swapping the name touches nothing else.

**Architecture:** A new inbound `app_mention` Events endpoint acks Slack in <3s, then runs work in `after()` (Next 16). It fetches the thread's recent messages (`conversations.replies`) and passes them as prior conversation to an OpenAI tool-calling loop (`lib/agent/`), which reasons over the existing derived store (`loadInstance` → registry/graph/blast) and n8n API, and replies in-thread via `chat.postMessage(thread_ts)`. Ownership actions call Linear's real API (`@linear/sdk` + `LINEAR_API_KEY`) — **not** the Claude-session MCP, which the deployed server cannot reach. Pure logic (blast radius, ticket-body builder, event parsing, thread-message mapping, tool routing) is TDD'd; I/O boundaries (Slack, OpenAI, Linear, n8n) are thin and integration-tested.

**Tech Stack:** Next.js 16 (App Router, `after()`), TypeScript, Vitest, `@slack/web-api` (already present), `openai` (already present), `@linear/sdk` (new), Prisma/Postgres store (existing), Zod (existing).

**Scope of THIS plan:** Phase 0 (Slack agent foundation) + Phase 1 (ownership remediation). Phases 2 (Ask-your-estate depth) and 3 (Process relationship) are scoped at the end as **separate follow-on plans** — each ships independently on top of this foundation.

**Decisions locked (2026-07-10):**
- Ingress surface: **@mention in channels/threads** (not the Assistant pane, not slash commands). Rationale: alerts already live in owner channels; Q&A + remediation happen in the same thread.
- Build order: **ownership remediation first** (Linear ticket wiring — button + payload already half-exist).
- **AI auto-fix (patching workflow JSON) is DEFERRED** to a later plan. This phase ships only *safe* actions: file ticket, assign owner, and (verify-gated) replay.

**Pre-req (human, before Task 1):**
- Branch: `git checkout -b feat/slack-coworker` (repo is on `main` with uncommitted work — commit or stash `lib/data/source.ts`, `lib/demo/fixtures.ts`, `lib/derive/registry.ts`, `lib/n8n/types.ts`, and the untracked `app/(backoffice)/loading.tsx`, `test/brief/daily.test.ts` first so the branch is clean).
- Slack app: in the manifest (`docs/slack-app-manifest.yaml`) add bot scopes `app_mentions:read`, `chat:write`, and **`channels:history` + `groups:history`** (to read the thread it's tagged in — the Claude-tag behavior) and **`reactions:write`** (the "on it" `eyes` reaction). Subscribe to bot event `app_mention`. Set the **Event Subscriptions Request URL** to `${APP_BASE_URL}/api/slack/events`. Reinstall the app. Rename the bot display name to **Otto**.
- Env: add `OPENAI_API_KEY` (agent brain) and `LINEAR_API_KEY` + `LINEAR_TEAM_ID` to `.env.local` and `.env.example`.

---

## File Structure

**New files:**
- `app/api/slack/events/route.ts` — Events API endpoint: `url_verification` challenge, signature verify, retry dedup, dispatch `app_mention` to the agent via `after()`.
- `lib/slack/events.ts` — pure parsing/guarding of the Slack event envelope (extract text, channel, `thread_ts`, strip the bot mention, decide "should respond").
- `lib/agent/tools.ts` — tool schema definitions (OpenAI function specs) + a typed dispatch table.
- `lib/agent/run.ts` — the tool-calling loop (bounded iterations) → final text/blocks.
- `lib/agent/context.ts` — loads a snapshot the tools read from (`loadInstance` → registry items + graph + owners), memoized per agent turn.
- `lib/derive/blast.ts` — **pure** blast-radius computation over edges + process groups. Reused by tools AND the brief.
- `lib/linear/client.ts` — thin Linear API wrapper (`createIssue`) via `@linear/sdk`; `linearFromEnv()` returns null when unconfigured (mirrors `n8nFromEnv`).
- `lib/linear/ticket.ts` — **pure** builder: `RegistryItem` + blast radius + recent changes → `{ title, description }` markdown.
- `lib/n8n/actions.ts` — write-side n8n client (replay). **Behind a verify-first task** — may end up unsupported.

**Modified files:**
- `app/api/slack/interactivity/route.ts` — add the missing `create_ticket` case (currently falls through to default no-op).
- `lib/slack/blocks.ts` — ensure ticket/action buttons carry `{ workflowId }` in `value` (needed by the handler).
- `lib/brief/build.ts` — enrich `whyItMatters`/actions with blast-radius summary (uses `lib/derive/blast.ts`).
- `docs/slack-app-manifest.yaml` — scopes + event subscription (see pre-req).
- `.env.example` — new keys.

---

## Chunk 0: Slack agent foundation

### Task 0.1: Blast-radius derivation (pure, TDD)

**Files:**
- Create: `lib/derive/blast.ts`
- Test: `test/derive/blast.test.ts`

Blast radius = for a given workflow id, everything impacted if it breaks/changes: downstream callers/callees (`calls` tier-A), credential-siblings (`shares-credential`), the systems it touches, its process group members, and the distinct owner teams of all of the above.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { blastRadius } from "@/lib/derive/blast";
import type { WorkflowGraph } from "@/lib/derive/graph";

const graph: WorkflowGraph = {
  nodes: [
    { id: "a", kind: "workflow", name: "Refund Agent", type: "ai-agent-tools", risk: "high", ownerTeam: "Support", recentFailures: 3, groupKey: "pg:a|b" },
    { id: "b", kind: "workflow", name: "Ledger Sync", type: "deterministic", risk: "medium", ownerTeam: "RevOps", recentFailures: 0, groupKey: "pg:a|b" },
    { id: "c", kind: "workflow", name: "Unrelated", type: "deterministic", risk: "low", ownerTeam: "Ops", recentFailures: 0, groupKey: null },
    { id: "system:Stripe", kind: "system", name: "Stripe" },
  ],
  edges: [
    { id: "calls:a->b", source: "a", target: "b", kind: "calls", tier: "A" },
    { id: "uses:a->system:Stripe", source: "a", target: "system:Stripe", kind: "uses-system", tier: "B" },
  ],
  groups: [{ key: "pg:a|b", name: "Refund process", workflowIds: ["a", "b"] }],
};

describe("blastRadius", () => {
  it("returns downstream workflows, systems, process group, and affected owners", () => {
    const r = blastRadius("a", graph);
    expect(r.downstreamWorkflowIds).toContain("b");
    expect(r.systems).toContain("Stripe");
    expect(r.processGroup?.name).toBe("Refund process");
    expect(r.affectedOwnerTeams.sort()).toEqual(["RevOps", "Support"]);
    expect(r.downstreamWorkflowIds).not.toContain("c");
  });

  it("is empty for an isolated workflow", () => {
    const r = blastRadius("c", graph);
    expect(r.downstreamWorkflowIds).toEqual([]);
    expect(r.systems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm vitest run test/derive/blast.test.ts` → FAIL ("blastRadius is not a function").

- [ ] **Step 3: Implement `lib/derive/blast.ts`**

```ts
import type { WorkflowGraph, WorkflowGraphNode } from "@/lib/derive/graph";

export interface BlastRadius {
  workflowId: string;
  downstreamWorkflowIds: string[]; // reachable via calls (A) + credential siblings (A)
  systems: string[];
  processGroup: { key: string; name: string; workflowIds: string[] } | null;
  affectedOwnerTeams: string[];
}

export function blastRadius(id: string, graph: WorkflowGraph): BlastRadius {
  const wfNodes = new Map(
    graph.nodes.filter((n): n is WorkflowGraphNode => n.kind === "workflow").map((n) => [n.id, n]),
  );

  const downstream = new Set<string>();
  const systems = new Set<string>();
  for (const e of graph.edges) {
    if ((e.kind === "calls" || e.kind === "shares-credential")) {
      if (e.source === id && wfNodes.has(e.target)) downstream.add(e.target);
      if (e.target === id && wfNodes.has(e.source)) downstream.add(e.source);
    }
    if (e.kind === "uses-system" && e.source === id) {
      systems.add(graph.nodes.find((n) => n.id === e.target)?.name ?? e.target);
    }
  }

  const group = graph.groups.find((g) => g.workflowIds.includes(id)) ?? null;
  const groupMembers = group ? group.workflowIds.filter((w) => w !== id) : [];

  const owners = new Set<string>();
  for (const wid of [...downstream, ...groupMembers]) {
    const team = wfNodes.get(wid)?.ownerTeam;
    if (team) owners.add(team);
  }
  const self = wfNodes.get(id)?.ownerTeam;
  if (self) owners.add(self);

  return {
    workflowId: id,
    downstreamWorkflowIds: [...downstream].sort(),
    systems: [...systems].sort(),
    processGroup: group ? { key: group.key, name: group.name, workflowIds: group.workflowIds } : null,
    affectedOwnerTeams: [...owners].sort(),
  };
}
```

- [ ] **Step 4: Run test, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(derive): blast-radius over graph edges + process groups"`

---

### Task 0.2: Slack event envelope parsing (pure, TDD)

**Files:**
- Create: `lib/slack/events.ts`
- Test: `test/slack/events.test.ts`

Responsibilities: classify the raw body (`url_verification` vs `event_callback`), and for `app_mention` extract `{ text, channel, threadTs, userId }` with the leading `<@BOT>` mention stripped. Bot-authored events return `null` (don't reply to self / avoid loops).

- [ ] **Step 1: Write failing test** covering: (a) `url_verification` → `{ kind: "challenge", challenge }`; (b) an `app_mention` with `<@U123> what touches Stripe?` → `{ kind: "mention", text: "what touches Stripe?", channel, threadTs }` where `threadTs` = event `thread_ts ?? ts`; (c) an event with `bot_id` set → `{ kind: "ignore" }`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `parseSlackEvent(body: unknown, botUserId: string)` returning a discriminated union `{ kind: "challenge"; challenge } | { kind: "mention"; text; channel; threadTs; userId } | { kind: "ignore" }`. Strip mention with `text.replace(/<@[A-Z0-9]+>/g, "").trim()`. `threadTs = event.thread_ts ?? event.ts` so replies stay in-thread.

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(slack): parse app_mention event envelope"`

---

### Task 0.3: Agent context snapshot

**Files:**
- Create: `lib/agent/context.ts`
- Test: `test/agent/context.test.ts` (thin — assert it composes registry + graph from a fixture instance)

- [ ] **Step 1: Write test** that feeds demo fixtures through `buildAgentContext()` and asserts it returns `{ items: RegistryItem[]; graph: WorkflowGraph }` with >0 items and the graph edges present.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** `buildAgentContext()`: call `loadInstance()`, load owners + links + group names from the store (reuse whatever `lib/data/map.ts` / `lib/data/load.ts` already assemble — **do not** duplicate derivation), return `{ items, graph }`. Keep it a single source the tools read.
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit.**

---

### Task 0.4: Read tools + dispatch (pure schema, TDD dispatch)

**Files:**
- Create: `lib/agent/tools.ts`
- Test: `test/agent/tools.test.ts`

Phase-0 tools (read-only): `search_workflows(query)`, `get_workflow_detail(id)`, `get_blast_radius(id)`, `who_owns(id)`. Each is a pure function of `(args, context)`. `tools.ts` exports (a) the OpenAI function specs and (b) a `dispatch(name, args, context)` map.

- [ ] **Step 1: Write test**: with the demo context, `dispatch("search_workflows", { query: "Stripe" }, ctx)` returns items whose `systems` include Stripe; `dispatch("get_blast_radius", { id }, ctx)` returns the `blastRadius(id, ctx.graph)` shape; unknown tool name throws.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** the four read tools. `search_workflows` = case-insensitive match over name/systems/toolNames/type/owner team. `get_blast_radius` delegates to `lib/derive/blast.ts`. Keep specs and dispatch co-located and DRY (one array → derived spec list + dispatch map).
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit.**

---

### Task 0.5: Agent loop

**Files:**
- Create: `lib/agent/run.ts`
- Test: `test/agent/run.test.ts` (inject a fake OpenAI client)

- [ ] **Step 1: Write test** with a stub LLM client: first response requests tool `search_workflows`, second response returns final text. Assert the loop executes the tool, feeds the result back, and returns the final assistant message. Assert it caps at N (e.g. 5) iterations.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** `runAgent({ userText, context, client })`:
  - System prompt: "You are the n8n Backoffice coworker. Answer about the automation estate in business terms. Always surface owner + blast radius when discussing a workflow. Be concise. If unsure, say so — never invent workflow names or metrics." Inject a compact estate summary (counts, high-risk names) so trivial questions need no tool call.
  - Loop: call `client.chat.completions.create({ model: "gpt-...", tools, messages })`; if `tool_calls`, run each via `dispatch`, append results, loop; else return content. Bound iterations.
  - Return `{ text: string }` (blocks come later).
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit.**

---

### Task 0.6: Events endpoint (integration)

**Files:**
- Create: `app/api/slack/events/route.ts`

- [ ] **Step 1: Implement** the route:
  - Read raw body; if `parseSlackEvent` → `challenge`, return `{ challenge }` immediately (Slack URL verification).
  - Verify signature with `verifySlackRequest` (reuse `lib/slack/verify.ts`). Reject 401 on failure.
  - **Retry dedup:** if header `x-slack-retry-num` is present, return `200` without processing (Slack re-sends on our slow ack; we already handled the first).
  - Parse event; if `ignore`, return 200. If `mention`:
    - Return `new Response("", { status: 200 })` **immediately**, and schedule work with `after()` from `next/server`:
      ```ts
      import { after } from "next/server";
      after(async () => {
        const ctx = await buildAgentContext();
        const { text } = await runAgent({ userText: ev.text, context: ctx, client: openaiFromEnv()! });
        await slackClient(botToken).chat.postMessage({ channel: ev.channel, thread_ts: ev.threadTs, text });
      });
      ```
  - Guard all env (bot token, OpenAI) — if missing, post a friendly "coworker not configured" message instead of throwing.
- [ ] **Step 2: Manual verify** (see "Manual Verification" section). Deploy to a preview URL, point the Slack Request URL at it, `@mention` the bot with "what workflows touch Stripe?" → expect an in-thread reply naming the Stripe workflows + owners.
- [ ] **Step 3: Commit** — `git commit -am "feat(slack): inbound app_mention agent endpoint"`

**GATE — end of Chunk 0:** the bot answers estate questions in-thread. No actions yet.

---

## Chunk 1: Ownership remediation

### Task 1.1: Linear ticket body builder (pure, TDD)

**Files:**
- Create: `lib/linear/ticket.ts`
- Test: `test/linear/ticket.test.ts`

- [ ] **Step 1: Write test**: `buildTicket({ item, blast, changes })` → `title` = `"[n8n] <name> — <headline>"`; `description` (markdown) contains owner team, criticality, systems, **blast-radius line** ("Affects N downstream workflows across teams X, Y"), recent-change summary if any, and a runbook/next-step line + a back-link placeholder to the workflow detail route.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** the pure builder (no network). Keep the markdown template readable and matched to `lib/brief/build.ts` tone.
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit.**

---

### Task 1.2: Linear API client

**Files:**
- Create: `lib/linear/client.ts`
- Modify: `package.json` (add `@linear/sdk`)

- [ ] **Step 1:** `pnpm add @linear/sdk`.
- [ ] **Step 2: Implement** `linearFromEnv()` → returns `{ createIssue({ title, description }): Promise<{ id, url }> }` using `new LinearClient({ apiKey: process.env.LINEAR_API_KEY })` and `LINEAR_TEAM_ID`; returns `null` when unconfigured (mirror `n8nFromEnv`). Wrap the SDK call so the rest of the app depends on our tiny interface, not the SDK surface.
- [ ] **Step 3: Manual smoke** in a scratch script: create one test issue against a sandbox Linear team, confirm URL comes back. (No unit test for the network call.)
- [ ] **Step 4: Commit.**

---

### Task 1.3: Wire the `create_ticket` interactivity action

**Files:**
- Modify: `app/api/slack/interactivity/route.ts` (add case), `lib/slack/blocks.ts` (ensure `value` carries `workflowId`)

Currently `"Create Linear ticket"` renders but the handler has **no `create_ticket` case** → falls through to default no-op. Wire it.

- [ ] **Step 1:** In `blocks.ts`, confirm the `create_ticket` button `value` includes `{ workflowId }` (and `key`). Adjust if missing.
- [ ] **Step 2:** In `interactivity/route.ts`, add:
  ```ts
  case "create_ticket": {
    const linear = linearFromEnv();
    if (!linear) { text = "Linear isn't configured — set LINEAR_API_KEY."; break; }
    const ctx = await buildAgentContext();
    const item = ctx.items.find((i) => i.id === value.workflowId);
    if (!item) { text = "Couldn't find that workflow."; break; }
    const blast = blastRadius(item.id, ctx.graph);
    const { title, description } = buildTicket({ item, blast, changes: [] });
    const issue = await linear.createIssue({ title, description });
    text = `✓ Linear ticket created: ${issue.url}`;
    break;
  }
  ```
- [ ] **Step 3: Manual verify**: click "Create Linear ticket" on a brief alert → issue appears in Linear with owner + blast radius in the body; Slack shows the ephemeral confirmation with the URL.
- [ ] **Step 4: Commit** — `git commit -am "feat(slack): wire Create Linear ticket action with owner + blast radius"`

---

### Task 1.4: Agent action tool — `create_linear_ticket`

**Files:**
- Modify: `lib/agent/tools.ts`, `test/agent/tools.test.ts`

Let the coworker file a ticket conversationally: "@bot open a ticket for the Refund Agent failures".

- [ ] **Step 1: Write test**: `dispatch("create_linear_ticket", { id }, ctx)` calls an injected Linear client and returns the issue URL; when Linear is unconfigured it returns a graceful message (no throw).
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** the tool: resolve item → `blastRadius` → `buildTicket` → `linear.createIssue`. **Confirmation guard:** the tool returns a *proposed* ticket preview unless `args.confirm === true`; the agent asks the user to confirm in-thread before the second call actually files it. (Prevents the LLM from spamming tickets.)
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit.**

---

### Task 1.5: Replay/retry — VERIFY-FIRST spike, then implement or drop

**Files:**
- Create (conditional): `lib/n8n/actions.ts`

⚠️ The n8n **public** REST API is read-oriented; a per-execution "retry" endpoint may not exist publicly (retry is often UI/internal-only). Do not write confident code against an unverified endpoint.

- [ ] **Step 1: Spike** — against the configured n8n instance, probe candidate endpoints (`POST /executions/{id}/retry`, or re-run via the workflow's trigger). Document what actually works in the plan file.
- [ ] **Step 2 (if supported):** implement `retryExecution(id)` in `lib/n8n/actions.ts` (write client, `X-N8N-API-KEY`), add a `replay_executions` agent tool + a "Replay failed" button case, both guarded by confirmation and blocked on High-criticality without an explicit confirm. Revalidate `INSTANCE_CACHE_TAG` after.
- [ ] **Step 2 (if NOT supported):** drop the button to a deep-link "Open failed executions in n8n" and record the limitation in `README` + this plan. Do **not** fake it.
- [ ] **Step 3: Commit** whichever branch — `git commit -am "feat(n8n): execution replay (verified) / deep-link fallback"`

---

### Task 1.6: Blast radius in the brief

**Files:**
- Modify: `lib/brief/build.ts`, `test/brief/*.test.ts`

- [ ] **Step 1: Update `incidentItem`/`promptItem` tests** to expect a blast-radius sentence in `whyItMatters` when downstream workflows exist (e.g. "Blocks Ledger Sync (RevOps); part of Refund process.").
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — thread `blastRadius` into `buildBrief` (it already has the graph inputs nearby via the map data path) and append the summary. Keep it one sentence.
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(brief): attach blast-radius impact to incident items"`

**GATE — end of Chunk 1:** the coworker answers questions AND files owner-aware, blast-radius-aware Linear tickets from both a button and an @mention. Briefs carry blast radius.

---

## Follow-on Plan A — Phase 2: Ask-Your-Estate depth (separate plan)

Ships on the Chunk-0 agent. Add tools: `recent_changes(sinceDays)` (reads `lib/diff/snapshot.ts` change events), `list_by_capability(capability)` (e.g. "can issue refunds" — leans on classify + enrich purpose), `estate_summary()` (counts, ROI via `timeSavedPerExecution`, zombies). Add a nightly "here's what changed" proactive thread. Detail in its own `docs/superpowers/plans/*-ask-your-estate.md` when Phase 1 lands.

## Follow-on Plan B — Phase 3: Process relationship (separate plan)

Three pieces, each its own chunk: (1) **auto-derive** ordered process chains from tier-A `calls` edges (an Execute-Workflow chain is an ordered process) → seed `part-of-process` groups, human confirms/renames (reuse the AI-suggests/human-confirms pattern); (2) **render as an ordered lane/sequence** on the map instead of a hull (`components/map/GroupNode.tsx`); (3) **process-level health/value rollup** (Σ member health/`timeSavedPerExecution`) surfaced in briefs + as an agent tool `process_status(name)`. Detail in `docs/superpowers/plans/*-process-relationship.md`.

---

## Env / config additions

`.env.example` + `.env.local`:
```
OPENAI_API_KEY=        # agent brain (already used by enrich)
LINEAR_API_KEY=        # ticket creation
LINEAR_TEAM_ID=        # target Linear team
```
Slack manifest (`docs/slack-app-manifest.yaml`): bot scopes `app_mentions:read`, `chat:write`; event subscription `app_mention`; Request URL `${APP_BASE_URL}/api/slack/events`.

## Manual verification (end-to-end)

1. `pnpm dev`, expose via a tunnel (or deploy a Vercel preview). Set Slack Event Request URL → `/api/slack/events`; Slack must show "Verified".
2. Invite the bot to `#n8n-backoffice`. `@bot what workflows touch Stripe?` → in-thread reply naming them + owners.
3. `@bot who owns the Refund Agent and what breaks if it goes down?` → owner + blast radius from `lib/derive/blast.ts`.
4. On a brief alert, click **Create Linear ticket** → issue in Linear with owner + blast radius; Slack confirms with URL.
5. `@bot open a ticket for the Refund Agent` → bot previews, asks to confirm, then files on "yes".

## Open risks / notes

- **`after()` on Vercel**: confirm the Fluid Compute function stays alive for the post-response work (it does under Fluid Compute; verify in preview logs). If a turn is slow, consider Vercel Queues later — out of scope now.
- **Event dedup via retry header** is coarse; if we ever do slow work *before* acking, move to store-backed `event_id` dedup.
- **LLM hallucination**: system prompt forbids inventing names/metrics; tools are the only source of workflow facts. Keep tool outputs authoritative and compact.
- **Linear MCP ≠ runtime**: reiterated — the deployed app uses `@linear/sdk`, never the Claude-session MCP.
- **n8n replay** may be unsupported publicly (Task 1.5) — Linear ticket is the guaranteed remediation win.
