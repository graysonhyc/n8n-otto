# Relationships Map Revamp — Design

**Date:** 2026-07-10
**Status:** Approved
**Supersedes:** the current "Dependency Map" (`/map`)

## Problem

The current map shows every relationship kind at equal weight in a force-directed
graph. With shared-credential edges drawn pairwise (N² for any shared key) and
app-level "system" nodes, it becomes a hairball where a real dependency (A calls
B) is indistinguishable from an incidental one (A and B both post to Slack). An
enterprise user reads it as "meaning nothing."

The map also conflates two fundamentally different notions of "related":

1. Relationships a human **asserts** (this SOP contains these workflows).
2. Relationships the machine **derives** from the workflow JSON.

Today these are merged (`computeProcessGroupsMerged` folds auto call-chains into
hand-named groups), so neither is trustworthy.

## Goals

- Make "how are these workflows related" answerable at a glance.
- Separate asserted structure from derived structure into two explicit modes.
- Relationships are **deterministic only** — parsed from workflow JSON by fixed
  rules. No LLM decides that a relationship exists. (An LLM may later *narrate* a
  relationship in prose, but never *create* one.)

## Non-goals

- No LLM-inferred relationships.
- No automatic SOP creation. SOPs are hand-authored.
- No changes to n8n itself; we only own data n8n does not.

## The two modes

The page (renamed **Relationships**) has one segmented toggle:

```
[ Process groups ]  [ Deterministic ]
```

State persists in the URL (`?view=groups|auto`, default `groups`). They are two
renders of the same workflow set, not two filters on one graph.

### Mode A — Process groups (manual SOP → workflows)

The epic/ticket model, made a real entity.

- **`ProcessGroup`** is a first-class stored row: stable `id`, `name`, optional
  `description`, `updatedAt`. (Replaces today's hash-keyed name-only row.)
- **`ProcessGroupMember`** assigns a workflow into an SOP at an ordered step:
  `{ workflowId (PK), groupId, position }`. **`workflowId` is the primary key**,
  which enforces the rule **one workflow belongs to at most one SOP** (for now).
- Authoring: create an SOP (the epic), assign workflows into it, order them
  (the tickets). Ordering gives the "step 1 → step 2 → step 3" reading.
- Render: each SOP is a titled container/lane; member workflows are cards inside,
  laid out in step order. Clicking a card opens the workflow detail. Workflows in
  no SOP sit in a muted "Unassigned" tray to be pulled in.
- The `part-of-process` link relation and `computeProcessGroupsMerged` retire
  from this mode. SOPs are purely what the user authors.

**Migration:** existing named `ProcessGroup` rows carry their names into new SOP
entities on a best-effort basis, seeding membership from current
`part-of-process` links + call-chain clusters (the old derived membership) so no
named group is lost. One-time, at migration.

### Mode B — Deterministic (auto-parsed, no LLM)

Three deterministic layers, ranked so the strong signal always dominates and weak
affinities never form a pairwise mesh.

| Layer | Rule | Default | Shape |
|---|---|---|---|
| **Dependencies** | `calls` (Execute-Workflow) + subworkflow-as-tool | **on** | directed edge, hierarchical L→R |
| **Data sources** | workflows touching the *same resource id* | toggle | resource **hub** node |
| **Credentials** | workflow → credential id | toggle | credential **hub** node |

- **Dependencies** are the skeleton: directed, bold, laid out left→right (dagre
  `rankdir: LR`) so "what depends on what" reads spatially.
  - `calls`: existing `workflowCallEdges` (Execute-Workflow → target workflow).
  - **subworkflow-as-tool (new rule):** a `toolWorkflow` / `executeWorkflow` node
    wired via an `ai_tool` connection into an agent, and referencing another
    workflow id. Rendered with a distinct arrow style — it is a tool, not a call.
- **Data sources (new rule):** extract the resource id already available via
  `resourceKey` (sheetId / channelId / table / documentId). Workflows sharing the
  same resource id connect to one **resource hub node** ("Q3 Revenue Sheet"). A
  star, never N² lines. This is the YouTube/LinkedIn "same Google Sheet" case,
  done deterministically. Off by default; toggle on.
- **Credentials:** first-class, **not noise** — "which workflow uses what
  credential." Modeled as **workflow → credential**, rendered as a **credential
  hub** (the credential is the hub node, workflows link to it). Same clean hub
  shape as data sources; its own toggle. Replaces today's pairwise
  `shares-credential` edges.

The default deterministic view is therefore just the dependency skeleton; the two
hub layers arrive only when toggled, and always as hubs.

## Data model changes (Prisma)

```prisma
/// A hand-authored SOP (epic). Members are assigned via ProcessGroupMember.
model ProcessGroup {
  id          String   @id @default(cuid())
  name        String
  description String?
  updatedAt   DateTime @updatedAt
  members     ProcessGroupMember[]
}

/// A workflow assigned into one SOP at an ordered step (ticket in an epic).
/// workflowId is the PK => a workflow belongs to at most one SOP.
model ProcessGroupMember {
  workflowId String       @id
  groupId    String
  position   Int          @default(0)
  group      ProcessGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@index([groupId])
}
```

The old `ProcessGroup { key, name, updatedAt }` model is migrated: its rows are
read once during migration to seed names, then the model is redefined as above.
`part-of-process` `WorkflowLink` rows are read to seed membership, then may remain
(harmless) or be cleaned — decided in the plan.

## Derivation / API changes

- `lib/derive/edges.ts`
  - add `subworkflowToolEdges(workflow)` — cross-workflow `ai_tool`→agent tool refs.
  - add `sharedDataSourceGroups(workflows)` — group by resource id → hub + members.
  - keep `credentialGroups` (already workflow→credential); drop pairwise
    `sharedCredentialEdges` from the map (may stay for other callers).
- `lib/derive/graph.ts` — `composeGraph` gains a `mode` (or two compose fns):
  - `composeDeterministic` → dependency edges + optional data-source/credential hubs.
  - `composeGroups` → SOPs with ordered members (from the new tables).
- `lib/derive/process.ts` — `computeProcessGroupsMerged` retires; SOP membership
  now comes from `ProcessGroupMember`, not clustering.
- New API routes under `app/api/process-groups/`:
  - `POST` create SOP, `PATCH` rename/describe, `DELETE` remove SOP.
  - `POST`/`DELETE` member assignment + reorder (`position`).
- `lib/backoffice/store.ts` — CRUD for `ProcessGroup` + `ProcessGroupMember`.

## UI changes

- `app/(backoffice)/map/page.tsx` → renamed **Relationships**; reads `?view=`.
- SideNav label "Map" → "Relationships".
- `components/map/` (or new `components/relationships/`):
  - `ModeToggle` — segmented control.
  - Process-groups render: SOP lanes + Unassigned tray + create/assign/reorder.
  - Deterministic render: hierarchical dependency graph + hub layers + layer toggles.
- `components/map/legend.ts` + `MapControls.tsx` updated for the new layer toggles
  (Dependencies always on; Data sources, Credentials as toggles).

## Testing

- `test/derive/edges.test.ts` — new rules: subworkflow-as-tool detection (fixtures
  with `toolWorkflow`/`executeWorkflow` wired `ai_tool`→agent), shared-data-source
  grouping (same vs different resource id), credential grouping.
- `test/derive/graph.test.ts` — `composeDeterministic` produces dependency-only
  default; hub layers appear only when requested; no pairwise credential mesh.
- Store/API tests for SOP CRUD + one-SOP-per-workflow enforcement + reorder.
- Migration: existing named groups keep names; membership seeded once.

## Rollout

1. Prisma model + migration (with best-effort name/membership seed).
2. Deterministic mode (most parsing exists) behind the toggle; default `groups`
   still works via a thin compatibility path until SOP authoring lands.
3. SOP authoring UI + APIs.
4. Rename page/nav; retire `computeProcessGroupsMerged` and pairwise
   `shares-credential` map edges.
```
