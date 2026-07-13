# Workflow Relationships Implementation Plan

> **For Claude:** Steps use checkbox (`- [ ]`) syntax. TDD: test → red → implement → green → commit. Spec: `docs/superpowers/specs/2026-07-13-workflow-relationships-design.md`.

**Goal:** Replace the fuzzy "SOP" grouping with four explicit, queryable relationship signals (shared-credential, shared-datasource, deterministic-structural, semantic-similar) surfaced as a summary+table dashboard, richer blast radius, and accurate Otto answers.

**Architecture:** Deterministic detectors are pure functions over workflow JSON in `lib/derive/`. A unifying `relationships.ts` tags every edge with a `RelationshipKind`. Blast radius consumes tagged edges. The semantic module (embeddings) is self-contained and cuttable. Dashboard = tiles + tables. Otto answers from structured tools.

**Tech Stack:** TypeScript, Next.js App Router, Prisma/Postgres, OpenAI (`text-embedding-3-small`), vitest.

**Conventions:** Tests in `test/**/*.test.ts` mirroring `lib/`. `import "server-only"` is stubbed in tests. Stage explicit paths on commit (never `git add -A`).

---

## Task 1: Rename SOP → "Linked workflows" + exclude utilities from auto-seed

**Files:**
- Modify: `lib/derive/process.ts` (default name, utility exclusion)
- Test: `test/derive/process.test.ts`
- Modify (strings only): brief/Slack/UI SOP copy (grep sweep)

- [ ] **Step 1:** Add failing test in `test/derive/process.test.ts`: a workflow called by ≥3 distinct callers (a utility) must NOT union all its callers into one group; and default group name is `"Linked workflows"`.
- [ ] **Step 2:** Run `pnpm vitest run test/derive/process.test.ts` → expect FAIL.
- [ ] **Step 3:** In `process.ts`: (a) default `name` `"Business process"` → `"Linked workflows"`. (b) In `callProcessPairs`, compute in-degree per callee; if a callee has ≥ `UTILITY_FANIN` (=3) distinct callers, skip its pairs (shared utility, not a linked group).
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5:** Grep sweep user-facing "SOP" → "Linked workflows" (keep DB table names): `lib/agent/tools.ts` (`list_processes`/`process_status` descriptions), `lib/brief/*`, Slack Create-SOP copy, `app/(backoffice)/map/**`, `components/**`. Leave `ProcessGroup`/`Sop` type + table names as-is.
- [ ] **Step 6:** `pnpm test && pnpm build`; commit `refactor(relationships): rename SOP→Linked workflows, exclude utilities from auto-group`.

## Task 2: Unify signals in `relationships.ts` + integration-count summary

**Files:**
- Create: `lib/derive/relationships.ts`
- Test: `test/derive/relationships.test.ts`

- [ ] **Step 1:** Test: `deriveRelationships(workflows)` over fixtures returns edges tagged `shared-credential`, `shared-datasource`, `structural:subworkflow`, `structural:subagent`; and a `summary` with `integrationCount` (distinct credential ids), `sharedCredentialCount` (creds used by ≥2), `connectionCount` (structural edges).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `RelationshipKind` union + `RelationshipEdge {from,to,kind,tier,label?,score?}` + `deriveRelationships()` composing existing `sharedCredentialEdges`, `sharedDataSourceGroups`→edges, `workflowCallEdges`→`structural:subworkflow`, `subworkflowToolEdges`→`structural:subagent`; plus `RelationshipSummary`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(relationships): unified signal detector + estate summary`.

## Task 3: Webhook / trigger handoff detector (4c)

**Files:**
- Modify: `lib/derive/edges.ts` (add `webhookHandoffEdges`)
- Modify: `lib/derive/relationships.ts` (include as `structural:webhook`)
- Test: `test/derive/edges.test.ts`

- [ ] **Step 1:** Test: workflow A with an `httpRequest` node whose URL contains workflow B's `webhook` node production path → one `structural:webhook` edge A→B. No match → no edge.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `webhookHandoffEdges(workflows)`: collect trigger paths (`webhook`/`formTrigger` `parameters.path`), collect outbound URLs (`httpRequest` `parameters.url`, unwrap resource-locator), emit edge when an outbound URL contains `/webhook/<path>`. Guard empty path.
- [ ] **Step 4:** Run → PASS. Wire into `deriveRelationships`.
- [ ] **Step 5:** Commit `feat(relationships): detect webhook handoff edges`.

## Task 4: Blast radius over all edge kinds (impact vs advisory)

**Files:**
- Modify: `lib/derive/blast.ts`
- Modify: `lib/derive/graph.ts` (feed new edges), `lib/agent/tools.ts` (`get_blast_radius` output)
- Test: `test/derive/blast.test.ts`

- [ ] **Step 1:** Test: blast radius partitions downstream into `impact` (structural + shared-credential + shared-datasource-resource) and `advisory` (semantic-similar + same-system); `affectedOwnerTeams` spans the impact set.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Extend `BlastRadius` with `advisoryWorkflowIds`; classify edges by kind when walking. Keep existing fields for back-comnpat.
- [ ] **Step 4:** Run → PASS. Update `get_blast_radius` tool + brief `blastNoteFor` to mention impact vs advisory.
- [ ] **Step 5:** Commit `feat(relationships): blast radius consumes all signals, impact vs advisory`.

## Task 5: Relationship dashboard — tiles + tables

**Files:**
- Modify: `app/(backoffice)/map/page.tsx`
- Create: `components/map/RelationshipSummary.tsx`, `components/map/SharedIntegrationsTable.tsx`, `components/map/ManualLinksTable.tsx`
- (Duplicates table added in Task 6)

- [ ] **Step 1:** Server component loads `deriveRelationships` + manual links. Render summary tiles (integrations, shared credentials, connections, manually-linked count).
- [ ] **Step 2:** Shared-integrations table: credential → workflows + count, each row links to blast radius.
- [ ] **Step 3:** Manually-linked table: every `WorkflowLink` (from → relation → to, source), reusing `app/api/links/route.ts` for edit/remove.
- [ ] **Step 4:** Keep drill-in neighbourhood graph (existing map graph) behind selecting one workflow; remove estate-wide default graph.
- [ ] **Step 5:** `pnpm build`; commit `feat(map): relationship summary + shared-integrations + manual-links tables`.

## Task 6: Semantic similarity module (CUTTABLE)

**Files:**
- Create: `lib/ai/embed.ts`, `lib/derive/similarity.ts`
- Modify: `prisma/schema.prisma` (+`WorkflowEmbedding`), `lib/backoffice/store.ts`
- Create: `components/map/DuplicatesTable.tsx`
- Modify: `lib/agent/tools.ts` (+`get_similar_workflows`), `lib/derive/relationships.ts`
- Test: `test/derive/similarity.test.ts`

- [ ] **Step 1:** Test cosine + threshold + top-K over canned vectors (no network). `purposeDoc(workflow)` is a stable string from name+description+node types+prompts+systems.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `purposeDoc`, `cosine`, `similarPairs(vectors, threshold=0.83, k=3)`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Add `WorkflowEmbedding(workflowId,versionId,vector Json,updatedAt)` via Supabase MCP (NOT `prisma db push` — pooler hangs); regenerate Prisma client; store helpers get/put embeddings.
- [ ] **Step 6:** `lib/ai/embed.ts`: batched `text-embedding-3-small`; only embed workflows whose `versionId` changed.
- [ ] **Step 7:** Wire `semantic-similar` edges into `deriveRelationships` (lazy import); add duplicates table + `get_similar_workflows` Otto tool.
- [ ] **Step 8:** `pnpm test && pnpm build`; commit `feat(relationships): semantic duplicate detection (embeddings)`.

## Task 7: Live-demo wiring (make the story real on live n8n)

**Files:**
- (done) `lib/demo/executions.ts` — Refund Review Agent = failing head.
- n8n graph: shared Stripe credential ref on Stripe nodes (per credential decision — pending user choice).
- `docs/otto-demo-story.md` — correct Stripe siblings to the live estate (Refund Agent + Refund Execution + Dunning Retry).

- [ ] **Step 1:** Resolve credential path (real dummy creds vs phantom injection); wire Stripe cred onto the 3 Stripe nodes so shared-credential blast radius fires on live.
- [ ] **Step 2:** Update `otto-demo-story.md` naming + assign owner+channel to Refund Review Agent in `/registry`.
- [ ] **Step 3:** Smoke test golden path (brief → untagged asks → notify → what-if blast radius).

---

## Notes / constraints
- DDL via Supabase MCP, never `prisma db push` (pooler hangs).
- Stage explicit paths on commit; never `git add -A`.
- Semantic module (Task 6) is the cut-line if interview timing is tight; Tasks 1–5 are 100% real on the live graph.
