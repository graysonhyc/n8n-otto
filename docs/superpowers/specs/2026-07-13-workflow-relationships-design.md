# Workflow Relationships — Design

**Date:** 2026-07-13
**Status:** Approved for planning
**Problem:** Help people understand how the workflows/agents in their n8n
workspace relate to each other — optimised for the **impact / blast-radius** job:
*"if this changes or breaks, what else is affected?"*

---

## 1. Motivation & reframe

n8n renders the node graph *inside* one workflow. Across a workspace the
relationships that matter are mostly **implicit** and invisible: shared
credentials, shared data sources, near-duplicate jobs, and runtime handoffs.

The current product leans on `executeWorkflow` call-edges and labels any connected
cluster an **"SOP"**. That is wrong on two counts:

1. A call-edge does not imply a standard operating procedure. It can be an
   orchestrator→sub-agent, a shared utility called by many, or a parallel fan-out.
   Worse, union-find over call-edges collapses everything that calls a popular
   utility into one bogus mega-"process".
2. Call-edges are the **rarest and most ambiguous** coupling signal. The abundant,
   unambiguous couplings (shared credential, shared data source) were secondary.

**Decisions:**

- **Kill the "SOP" term.** Rename the user-facing concept to **"Linked
  workflows."** Linked ≠ SOP. Workflow names/descriptions are untouched.
- **Express "relationship" as four explicit signal types**, each independently
  detected, labelled, and queryable — rather than one fuzzy grouping.

---

## 2. The four relationship signals

| # | Signal | Kind tag | Determinism | Status |
|---|--------|----------|-------------|--------|
| 1 | **Shared credential** — two workflows use the same credential id | `shared-credential` | exact | exists (`edges.ts`), needs surfacing |
| 2 | **Shared data source / system** — same Sheet/table/channel/system | `shared-datasource` | exact (resource) / heuristic (system) | exists (`edges.ts`) |
| 3 | **Semantic similarity** — two workflows do ~the same job | `semantic-similar` | probabilistic | 🆕 (embeddings) |
| 4 | **Deterministic structural link** | `structural:*` | exact | partial |
| 4a | · `executeWorkflow` sub-call | `structural:subworkflow` | exact | exists |
| 4b | · agent → sub-workflow exposed as a tool | `structural:subagent` | exact | exists (`subworkflowToolEdges`) |
| 4c | · **webhook / trigger handoff** — one workflow's HTTP target is another's trigger path | `structural:webhook` | exact-ish | 🆕 |

Manual links (`ManualLink`, relations `depends-on / triggers / duplicate-of /
part-of-process / shares-data-with`) are the **human-authored** counterpart and use
the same vocabulary. Auto-detected signals are *suggestions*; a manual link (or a
named group) is the human-confirmed truth and always wins.

### 2.1 Deterministic detectors (spine — signals 1, 2, 4)

Extend `lib/derive/edges.ts` / a new `lib/derive/relationships.ts`:

- **1 shared-credential** — already computed by `credentialUsage` /
  `sharedCredentialEdges`. Surface the **integration count** = distinct credential
  ids across the estate, and a ranked "most-shared credentials" list (credential →
  workflow count). This is the headline blast-radius metric.
- **2 shared-datasource** — `sharedDataSourceGroups` (same resource id) + tier-B
  `systemEdges` (same system). Keep as-is.
- **4a/4b** — `workflowCallEdges`, `subworkflowToolEdges`. Keep; just re-tag with
  the `structural:*` kind and classify **sub-call vs sub-agent** explicitly instead
  of merging into a "process".
- **4c webhook handoff (new)** — for each workflow, collect (a) trigger paths from
  `webhook`/`formTrigger` nodes, (b) outbound targets from `httpRequest` node URLs.
  Match an outbound URL that contains another workflow's production webhook path →
  emit a `structural:webhook` edge `caller → callee`. Exact string match on the
  path segment; no guessing. Skip if the instance base URL is unknown.

### 2.2 Semantic similarity (module — signal 3, cuttable)

Self-contained in `lib/derive/similarity.ts` + `lib/ai/embed.ts`. Built so it can
be wired last and removed without touching signals 1/2/4.

- **Purpose document** per workflow: `name` + `description` + sorted node
  `type`s + agent `systemMessage`s + touched systems. Deterministic string.
- **Embed** once via OpenAI `text-embedding-3-small`, batched (one request for the
  estate). Cache by `workflowId + versionId` (workflows carry `versionId`) so an
  unchanged workflow is never re-embedded. Cache store: a small Postgres table
  `WorkflowEmbedding(workflowId, versionId, vector, updatedAt)` via Prisma, read
  through the existing store layer.
- **Pairs**: cosine similarity, keep pairs ≥ threshold (start `0.83`, tune),
  cap to top-K per workflow. Emit `semantic-similar` edges with the score.
- **Never auto-merge** similar workflows into a group — surface as "possible
  duplicates" for a human to confirm (which creates a `duplicate-of` manual link).

> Cost: whole estate embeds for a fraction of a cent; re-embeds only on change.

---

## 3. Blast radius (the core job)

Extend `lib/derive/blast.ts` to consume **all** edge kinds, weighted by
determinism:

- **Impact set** (breaks/affected if this changes): downstream via
  `structural:*` (exact) + `shared-credential` (exact) + `shared-datasource`
  (exact resource). These are the confident blast radius.
- **Advisory set**: `semantic-similar` ("a near-duplicate exists — changing one may
  need changing the other") and tier-B same-system. Shown separately, labelled
  lower-confidence.
- **Affected owner teams** — distinct owner teams across the impact set (who to
  page). Already computed; extend to new edges.

This powers two delivery surfaces:

1. **Reactive** (existing incident flow): on failure/change, the brief/alert names
   the blast radius. *"Refund Review Agent failed → blocks Refund Execution
   (structural); Stripe credential shared by 3 workflows; notify Support + Billing."*
2. **Proactive what-if** (Otto): *"what breaks if I rotate the Stripe key / pause
   this / this goes down?"* → the same blast-radius query, on demand. The
   `terraform plan` for the automation estate.

---

## 4. Relationship dashboard (the `map` surface)

Rendering every workflow as a graph does not scale and does not answer the job.
Replace the estate-wide graph with **summary + tables**, drill-in for detail.

**Summary tiles** (top of `app/(backoffice)/map`):
- **Integrations** — distinct credentials in use (the "integration count").
- **Shared credentials** — how many are used by ≥2 workflows (coupling risk).
- **Connections** — count of deterministic structural links (4a/b/c).
- **Possible duplicates** — count of `semantic-similar` pairs (if module on).
- **Manually linked** — count of human `ManualLink`s.

**Tables:**
- **Shared integrations** — credential → workflows using it, sorted by count.
  Each row → "view blast radius".
- **Possible duplicates** — workflow A ↔ workflow B, similarity score, "confirm
  duplicate" (creates a `duplicate-of` manual link) / "dismiss". (module on only)
- **Manually linked workflows** — every `ManualLink`: from → relation → to,
  source, editable/removable. This is the human source of truth and must be
  first-class on the page (links are already configurable via
  `app/api/links/route.ts` + `components/detail/Relationships.tsx`).

**Drill-in:** clicking a workflow opens a **focused neighbourhood graph** — that
workflow plus only its directly-related nodes across the four signals — never the
whole estate.

---

## 5. Otto — accurate answers for signals 1–4

Each signal is a real query, so Otto answers from **structured tools**, not prose
guessing. Add/confirm tools in `lib/agent/tools.ts`:

- `get_shared_credentials(credentialName?)` → credentials and their workflows +
  counts. Answers "what shares the Stripe key", "how many integrations do we have".
- `get_blast_radius(workflowOrCredential)` → impact + advisory sets + owner teams.
  Answers "what breaks if X fails / I rotate Y".
- `get_similar_workflows(workflow?)` → duplicate candidates + scores. Answers "do we
  have duplicate agents", "anything like my churn agent". (module on only)
- `get_connections(workflow)` → the structural links (sub-call / sub-agent /
  webhook) for a workflow. Answers "what does this connect to / call".

Otto's vocabulary switches from "SOP" to "linked workflows" / the specific signal
name.

---

## 6. Rename scope: SOP → "Linked workflows"

User-facing strings + concepts only; keep DB table names to avoid a migration.

- `lib/derive/process.ts` — default group name `"Business process"` →
  `"Linked workflows"`; doc comments; keep union-find but **exclude high-fan-in
  utilities** from auto-seeding (a callee with ≥N distinct callers is shared
  infrastructure, not a linked group).
- Authored `Sop` / `SopMember` / `SopWithMembers` / suggestion flow — relabel UI
  and Slack copy ("Create SOP" → "Group as linked workflows" / "Link these").
  `map/sop/[id]` board title + nav.
- Brief `sharedCredentialItem`, incident blast notes — wording.
- Docs: `otto-demo-story.md`, `otto-demo-runbook.md`, case-study outline.

---

## 7. Module boundaries

- `lib/derive/relationships.ts` — unifies the four signal detectors behind one
  `deriveRelationships(workflows, executions)` returning tagged edges + summary
  counts. Deterministic detectors only; imports similarity lazily.
- `lib/derive/similarity.ts` + `lib/ai/embed.ts` — the cuttable semantic module.
- `lib/derive/blast.ts` — consumes tagged edges; unchanged interface, richer input.
- `app/(backoffice)/map` — summary + tables; drill-in neighbourhood graph.
- `lib/agent/tools.ts` — four structured tools.

Each is independently testable: detectors are pure functions over workflow JSON;
similarity is a pure function over embeddings; blast radius is a pure function over
the edge set.

---

## 8. Testing

- Unit: each detector against fixture workflows (`lib/demo/fixtures.ts`) — assert
  exact edges for shared-cred, data-source, sub-call, sub-agent, webhook handoff.
- Unit: cosine/threshold logic against canned vectors (no network).
- Unit: blast radius over a hand-built edge set — impact vs advisory partition,
  owner-team fan-out.
- Integration: Otto tool outputs are structured and match the derived data.

---

## 9. Build order (spine first, module last)

1. Rename SOP → "Linked workflows"; exclude utilities from auto-seed. *(defuses the
   critique immediately)*
2. `relationships.ts` — unify + tag signals 1, 2, 4a/b; add integration-count
   summary.
3. Webhook-handoff detector (4c).
4. Blast radius over all deterministic edges; wire reactive brief + Otto what-if.
5. Dashboard: summary tiles + shared-integrations table + manually-linked table.
6. **(cuttable)** Semantic module: embed + cosine + duplicates table + Otto tool.

Steps 1–5 are 100% real on the live graph. Step 6 is the differentiator and the
first thing to cut if time is short before the interview.
