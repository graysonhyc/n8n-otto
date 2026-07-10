# Relationships Map Revamp — Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Dependency Map" hairball with a two-mode **Relationships** view — hand-authored SOP process groups (epic→tickets) and a deterministic auto-parsed graph (dependencies + shared-data-source hubs + credential hubs), with no LLM in relationship derivation.

**Architecture:** A single `?view=groups|auto` toggle renders the same workflow set two ways. Deterministic relationships come only from fixed parsers over the n8n workflow JSON (`lib/derive/edges.ts`). SOPs become first-class Prisma entities (`ProcessGroup` + `ProcessGroupMember`, one workflow → one SOP) authored via new API routes, replacing today's hash-keyed name-only rows and the auto-clustering merge.

**Tech Stack:** Next.js 16 App Router, Prisma + Postgres, `@xyflow/react` + dagre for the graph, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-07-10-relationships-map-revamp-design.md`

---

## File Structure

**Derivation (deterministic, pure, most-testable — build first):**
- `lib/derive/edges.ts` (modify) — add `subworkflowToolEdges`, `sharedDataSourceGroups`; `credentialGroups` already workflow→credential.
- `lib/derive/graph.ts` (modify) — add `composeDeterministic` (dependencies + optional hub layers); keep `composeGraph` temporarily for compat.
- `lib/derive/process.ts` (modify, later) — retire `computeProcessGroupsMerged`; SOP membership now from DB.

**Persistence:**
- `prisma/schema.prisma` (modify) — redefine `ProcessGroup`, add `ProcessGroupMember`.
- `lib/backoffice/types.ts` (modify) — `Sop`, `SopMember` domain types.
- `lib/backoffice/store.ts` (modify) — SOP + member CRUD; drop `getProcessGroupNames`/`setProcessGroupName`.

**API:**
- `app/api/process-groups/route.ts` (rewrite) — `POST` create, `PATCH` rename/describe, `DELETE`.
- `app/api/process-groups/members/route.ts` (create) — `POST` assign, `DELETE` unassign, `PATCH` reorder.

**Data loaders:**
- `lib/data/map.ts` (modify) — `loadDeterministic()` and `loadGroups()`.

**UI:**
- `app/(backoffice)/map/page.tsx` (modify) — rename to Relationships, read `?view=`, branch render.
- `components/map/ModeToggle.tsx` (create) — segmented control.
- `components/map/MapCanvas.tsx` (modify) — deterministic render + layer toggles.
- `components/map/legend.ts`, `components/map/MapControls.tsx` (modify) — Dependencies (on) / Data sources / Credentials toggles.
- `components/relationships/GroupsBoard.tsx` (create) — SOP lanes + Unassigned tray + create/assign/reorder.
- `components/shell/SideNav.tsx` (modify) — label "Map" → "Relationships".

**Tests:**
- `test/derive/edges.test.ts`, `test/derive/graph.test.ts` (modify).
- `test/backoffice/sop.test.ts` (create, if store is unit-testable; else API integration).

---

## Chunk 1: Deterministic derivation rules

### Task 1: Subworkflow-as-tool edge rule

A subworkflow used as an agent tool = a `toolWorkflow` node (or `executeWorkflow` wired `ai_tool`) that references another workflow id AND feeds an agent via an `ai_tool` connection. This is a **cross-workflow** dependency (unlike `agentToolEdges`, which is intra-workflow node→node).

**Files:**
- Modify: `lib/derive/edges.ts`
- Test: `test/derive/edges.test.ts`

- [ ] **Step 1: Add a fixture** in `lib/demo/fixtures.ts` — a workflow `contentOrchestrator` with an `agent` node and a `@n8n/n8n-nodes-langchain.toolWorkflow` node named "Format Post" whose `parameters.workflowId` (string or `{value}`) points to another fixture workflow id, connected `ai_tool` → the agent. Add it to `allWorkflows`.

- [ ] **Step 2: Write the failing test**

```ts
// test/derive/edges.test.ts
import { subworkflowToolEdges } from "@/lib/derive/edges";
import { contentOrchestrator } from "@/lib/demo/fixtures";

it("Tier A: subworkflow-as-tool from toolWorkflow wired into an agent", () => {
  const edges = subworkflowToolEdges(contentOrchestrator);
  expect(edges).toContainEqual({
    from: contentOrchestrator.id,
    to: "wf_format_post",           // referenced workflow id
    kind: "subworkflow-tool",
    tier: "A",
  });
});
```

- [ ] **Step 3: Run test — expect FAIL** (`subworkflowToolEdges is not a function`).
Run: `npx vitest run test/derive/edges.test.ts -t "subworkflow-as-tool"`

- [ ] **Step 4: Implement** in `lib/derive/edges.ts`:

```ts
const TOOL_WORKFLOW_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.toolWorkflow",
]);

export interface SubworkflowToolEdge {
  from: string; // caller workflow id
  to: string;   // referenced (tool) workflow id
  kind: "subworkflow-tool";
  tier: "A";
}

/** Subworkflows exposed to an agent as a tool: a toolWorkflow node wired
 *  ai_tool -> an agent node, referencing another workflow id. */
export function subworkflowToolEdges(workflow: N8nWorkflow): SubworkflowToolEdge[] {
  const agents = new Set(
    workflow.nodes.filter((n) => n.type === AGENT_TYPE).map((n) => n.name),
  );
  if (agents.size === 0) return [];
  // node name -> referenced workflow id, for tool-capable nodes
  const refByNode = new Map<string, string>();
  for (const node of workflow.nodes) {
    if (!TOOL_WORKFLOW_TYPES.has(node.type) && node.type !== EXECUTE_WORKFLOW_TYPE) continue;
    const ref = referencedWorkflowId(node.parameters);
    if (ref) refByNode.set(node.name, ref);
  }
  const edges: SubworkflowToolEdge[] = [];
  const seen = new Set<string>();
  for (const [sourceName, byType] of Object.entries(workflow.connections)) {
    if (!byType.ai_tool) continue;
    const to = refByNode.get(sourceName);
    if (!to) continue;
    const feedsAgent = byType.ai_tool.some((g) => g.some((t) => agents.has(t.node)));
    if (feedsAgent && !seen.has(to)) {
      seen.add(to);
      edges.push({ from: workflow.id, to, kind: "subworkflow-tool", tier: "A" });
    }
  }
  return edges;
}
```

- [ ] **Step 5: Run test — expect PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(derive): subworkflow-as-tool edge rule"`

### Task 2: Shared-data-source grouping rule

Group workflows by the **same resource id** (sheet/channel/table/doc). Produces one hub per resource with its member workflow ids — never pairwise edges.

**Files:** Modify `lib/derive/edges.ts`; Test `test/derive/edges.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { sharedDataSourceGroups } from "@/lib/derive/edges";
it("groups workflows that touch the same resource id into one hub", () => {
  const groups = sharedDataSourceGroups(allWorkflows);
  const g = groups.find((x) => x.resource === "#cs-alerts");
  expect(g).toBeDefined();
  expect(g!.system).toBe("Slack");
  expect(g!.workflowIds.length).toBeGreaterThanOrEqual(2); // only shared ones kept
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (reuse existing `SYSTEM_BY_NODE`, `resourceKey`, `baseName`):

```ts
export interface DataSourceGroup {
  id: string;            // "res:<system>:<resource>"
  system: string;
  resource: string;
  workflowIds: string[]; // sorted, length >= 2
}

export function sharedDataSourceGroups(workflows: N8nWorkflow[]): DataSourceGroup[] {
  const byRes = new Map<string, { system: string; resource: string; ids: Set<string> }>();
  for (const wf of workflows) {
    for (const node of wf.nodes) {
      const base = baseName(node.type);
      const normalized = base.endsWith("Tool") ? base.slice(0, -4) : base;
      const system = SYSTEM_BY_NODE[normalized];
      const resource = resourceKey(node.parameters);
      if (!system || !resource) continue;
      const key = `res:${system}:${resource}`;
      const entry = byRes.get(key) ?? { system, resource, ids: new Set<string>() };
      entry.ids.add(wf.id);
      byRes.set(key, entry);
    }
  }
  return [...byRes.entries()]
    .filter(([, v]) => v.ids.size >= 2)
    .map(([id, v]) => ({ id, system: v.system, resource: v.resource, workflowIds: [...v.ids].sort() }));
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(derive): shared-data-source grouping`

---

## Chunk 2: Deterministic graph composition

### Task 3: `composeDeterministic`

Builds a graph with a strong dependency skeleton plus optional hub layers. Layer flags decide whether data-source and credential hubs are emitted; dependencies are always emitted.

**Files:** Modify `lib/derive/graph.ts`; Test `test/derive/graph.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { composeDeterministic } from "@/lib/derive/graph";

const base = { workflows: allWorkflows, executions, owners: new Map(), now: 0 };

it("default = dependency skeleton only, no hub nodes", () => {
  const g = composeDeterministic({ ...base, layers: { dataSources: false, credentials: false } });
  expect(g.nodes.every((n) => n.kind === "workflow")).toBe(true);
  expect(g.edges.every((e) => e.kind === "calls" || e.kind === "subworkflow-tool")).toBe(true);
});

it("data-source layer adds resource hubs, not pairwise edges", () => {
  const g = composeDeterministic({ ...base, layers: { dataSources: true, credentials: false } });
  expect(g.nodes.some((n) => n.kind === "resource")).toBe(true);
  expect(g.edges.some((e) => e.kind === "shares-credential")).toBe(false);
});

it("credential layer adds credential hubs", () => {
  const g = composeDeterministic({ ...base, layers: { dataSources: false, credentials: true } });
  expect(g.nodes.some((n) => n.kind === "credential")).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Add node kinds and the compose fn:

```ts
export interface ResourceGraphNode { id: string; kind: "resource"; name: string; system: string; }
export interface CredentialGraphNode { id: string; kind: "credential"; name: string; }
export type GraphNode = WorkflowGraphNode | ResourceGraphNode | CredentialGraphNode;

export interface DeterministicInput {
  workflows: N8nWorkflow[]; executions: N8nExecution[];
  owners: Map<string, Owner>; now: number;
  layers: { dataSources: boolean; credentials: boolean };
}

export function composeDeterministic(input: DeterministicInput): WorkflowGraph {
  const { workflows, executions, owners, now, layers } = input;
  const ids = new Set(workflows.map((w) => w.id));
  const workflowNodes: WorkflowGraphNode[] = workflows.map((wf) => {
    const item = composeRegistryItem(wf, executions, owners.get(wf.id) ?? null, now);
    return { id: wf.id, kind: "workflow", name: item.name, type: item.type,
      risk: item.risk.level, ownerTeam: item.owner?.team ?? null,
      recentFailures: item.health.recentFailures, groupKey: null };
  });
  const nodes: GraphNode[] = [...workflowNodes];
  const edges: GraphEdge[] = [];

  // Strong: calls + subworkflow-as-tool (skip dangling targets).
  for (const wf of workflows) {
    for (const e of workflowCallEdges(wf))
      if (ids.has(e.to)) edges.push({ id: `calls:${e.from}->${e.to}`, source: e.from, target: e.to, kind: "calls", tier: "A" });
    for (const e of subworkflowToolEdges(wf))
      if (ids.has(e.to)) edges.push({ id: `tool:${e.from}->${e.to}`, source: e.from, target: e.to, kind: "subworkflow-tool", tier: "A" });
  }

  if (layers.dataSources) {
    for (const g of sharedDataSourceGroups(workflows)) {
      nodes.push({ id: g.id, kind: "resource", name: g.resource, system: g.system });
      for (const wid of g.workflowIds)
        edges.push({ id: `res:${g.id}:${wid}`, source: wid, target: g.id, kind: "uses-resource", tier: "A", label: g.system });
    }
  }
  if (layers.credentials) {
    for (const c of credentialGroups(workflows).filter((c) => c.workflowIds.length >= 1)) {
      const nodeId = `cred:${c.credentialId}`;
      nodes.push({ id: nodeId, kind: "credential", name: c.credentialName });
      for (const wid of c.workflowIds)
        if (ids.has(wid)) edges.push({ id: `${nodeId}:${wid}`, source: wid, target: nodeId, kind: "uses-credential", tier: "A", label: c.credentialName });
    }
  }
  return { nodes, edges, groups: [] };
}
```
Extend `GraphEdge["kind"]` union with `"subworkflow-tool" | "uses-resource" | "uses-credential"`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(derive): composeDeterministic with layered hubs`

---

## Chunk 3: SOP persistence & API

### Task 4: Prisma model + migration

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1:** Replace the `ProcessGroup` model and add `ProcessGroupMember` (see spec §"Data model changes"). `workflowId` is PK on the member table (enforces one-SOP-per-workflow).
- [ ] **Step 2: Create migration with a name/membership seed.** Run:
`npx prisma migrate dev --name relationships_sop_entities`
In the generated migration, before dropping the old `ProcessGroup.key` column, copy each old row into a new SOP (`INSERT INTO "ProcessGroup"(id,name,updatedAt) ...`) and seed `ProcessGroupMember` from `part-of-process` `WorkflowLink` rows (respecting the one-SOP-per-workflow PK; first assignment wins). Document the SQL in the migration.
- [ ] **Step 3:** `npx prisma generate`; `npm run build` to confirm types compile.
- [ ] **Step 4: Commit** — `feat(db): SOP ProcessGroup + ProcessGroupMember entities`

### Task 5: Store CRUD + domain types

**Files:** Modify `lib/backoffice/types.ts`, `lib/backoffice/store.ts`

- [ ] **Step 1:** Add `Sop { id; name; description: string|null }` and `SopMember { workflowId; groupId; position }` to types.
- [ ] **Step 2:** Replace `getProcessGroupNames`/`setProcessGroupName` with:
  `listSops()`, `createSop(name)`, `updateSop(id,{name?,description?})`, `deleteSop(id)`,
  `assignMember(workflowId, groupId, position?)` (upsert on `workflowId` PK → moving a workflow reassigns it), `unassignMember(workflowId)`, `reorderMembers(groupId, orderedWorkflowIds)`.
- [ ] **Step 3:** Update every caller of the removed fns (`lib/data/map.ts`, `lib/derive/graph.ts` compose, brief code). Grep: `grep -rn "getProcessGroupNames\|setProcessGroupName\|computeProcessGroupsMerged" lib app`.
- [ ] **Step 4:** `npm run build` clean.
- [ ] **Step 5: Commit** — `feat(store): SOP + member CRUD`

### Task 6: API routes

**Files:** Rewrite `app/api/process-groups/route.ts`; Create `app/api/process-groups/members/route.ts`

- [ ] **Step 1:** `route.ts` — `POST {name}` → createSop; `PATCH {id,name?,description?}` → updateSop; `DELETE {id}` → deleteSop. Zod-validate; return the row.
- [ ] **Step 2:** `members/route.ts` — `POST {workflowId,groupId}` → assignMember; `DELETE {workflowId}` → unassignMember; `PATCH {groupId,orderedWorkflowIds}` → reorderMembers.
- [ ] **Step 3:** Manual smoke via `curl` against `npm run dev` (create SOP, assign two workflows, reorder, unassign, delete). Confirm one-SOP-per-workflow: assigning an already-assigned workflow moves it.
- [ ] **Step 4: Commit** — `feat(api): SOP + member routes`

---

## Chunk 4: UI — the two modes

### Task 7: Data loaders + page branch + toggle

**Files:** Modify `lib/data/map.ts`, `app/(backoffice)/map/page.tsx`; Create `components/map/ModeToggle.tsx`

- [ ] **Step 1:** `lib/data/map.ts` — `loadDeterministic(layers)` → `composeDeterministic`; `loadGroups()` → `{ sops: (Sop & {members})[], unassigned: WorkflowGraphNode[] }` from `listSops` + the full workflow set minus assigned.
- [ ] **Step 2:** `page.tsx` — read `searchParams.view` (default `groups`); render `<ModeToggle>` + either `<GroupsBoard>` or `<MapCanvas>`. Rename header/title to **Relationships**.
- [ ] **Step 3:** `ModeToggle.tsx` — segmented `[Process groups][Deterministic]`, sets `?view=` via `useRouter`. Follow existing `MapControls` styling.
- [ ] **Step 4:** Update `components/shell/SideNav.tsx` label `"Map"` → `"Relationships"`.
- [ ] **Step 5: Commit** — `feat(relationships): mode toggle + loaders + page branch`

### Task 8: Deterministic render (layers, hubs, hierarchy)

**Files:** Modify `components/map/MapCanvas.tsx`, `components/map/legend.ts`, `components/map/MapControls.tsx`, `components/map/SystemNode.tsx` (or add `ResourceNode`/`CredentialNode`)

- [ ] **Step 1:** Controls: **Dependencies** (always on, not a toggle), **Data sources** (toggle, default off), **Credentials** (toggle, default off). Remove old colorBy=risk-only assumptions only if broken.
- [ ] **Step 2:** Edge styles: `calls` solid arrow; `subworkflow-tool` distinct (e.g. accent dashed arrow, labeled "tool"); `uses-resource` / `uses-credential` thin hub spokes. Update `edgeStyle`.
- [ ] **Step 3:** Node types: reuse `SystemNode` shape for `resource` and `credential` hub nodes (label = resource/credential name, small system chip). Register in `nodeTypes`.
- [ ] **Step 4:** Keep dagre `rankdir: LR`; hubs get their own rank naturally. Confirm no crash when a layer is empty.
- [ ] **Step 5:** Manual check in `npm run dev` at `/map?view=auto`: skeleton reads L→R; toggling Data sources shows a shared-Sheet hub as a star; Credentials shows credential hubs.
- [ ] **Step 6: Commit** — `feat(relationships): deterministic layered render`

### Task 9: Process-groups board (SOP authoring)

**Files:** Create `components/relationships/GroupsBoard.tsx`

- [ ] **Step 1:** Render SOP lanes (title + description, editable via PATCH), member workflow cards in `position` order, and a muted **Unassigned** tray.
- [ ] **Step 2:** Actions: "New SOP" (POST), assign a workflow into an SOP (POST members — moves if already assigned), reorder within a lane (PATCH members), unassign (DELETE), delete SOP (DELETE). `router.refresh()` after each. Reorder can start as up/down buttons (no drag-lib dependency) — YAGNI on DnD.
- [ ] **Step 3:** Card click → `/workflow/[id]`.
- [ ] **Step 4:** Manual check at `/map?view=groups`: create an SOP, pull two workflows in, reorder, confirm a workflow can only live in one SOP.
- [ ] **Step 5: Commit** — `feat(relationships): SOP authoring board`

---

## Chunk 5: Cleanup

### Task 10: Retire the old merge path

**Files:** Modify `lib/derive/process.ts`, `lib/derive/graph.ts`, `lib/derive/edges.ts`

- [ ] **Step 1:** Remove `computeProcessGroupsMerged` and (if now unused) `computeProcessGroups`/`callProcessPairs`; update `test/derive/process.test.ts`.
- [ ] **Step 2:** Remove the pairwise `sharedCredentialEdges` usage from the map (keep the fn only if another caller needs it — grep first).
- [ ] **Step 3:** Delete/settle the old `composeGraph` once `page.tsx` no longer imports it.
- [ ] **Step 4:** `npm run test` all green; `npm run build` clean; `npm run lint`.
- [ ] **Step 5: Commit** — `refactor(derive): retire auto-merge + pairwise credential edges`

---

## Definition of done

- `npm run test` green (new edge/graph tests included), `npm run build` + `npm run lint` clean.
- `/map?view=groups` authors SOPs (one workflow → one SOP); `/map?view=auto` shows a readable L→R dependency skeleton with Data-source and Credential hub layers as toggles.
- No LLM anywhere in relationship derivation.
- Existing named groups' names survive migration.
```
