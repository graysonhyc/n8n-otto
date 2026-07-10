# Dependency Map Feature — Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:executing-plans (or subagent-driven-development) to implement. Steps use checkbox (`- [ ]`) syntax for tracking. Commit after every green step.

**Goal:** Build the `/map` screen — an interactive dependency-graph canvas of all workflows and the systems they touch, with SOP process-group clusters, color-by toggles, filters, and click-through to Detail — replacing the "soon" nav placeholder.

**Architecture:** A pure derivation function `composeGraph()` shapes the data `loadInstance()` already fetches (workflows + executions + owners + manual links) into `{ nodes, edges, groups }`. Process groups are connected components of `part-of-process` manual links, named via a tiny `ProcessGroup` store row. An RSC loads the model server-side; a client `MapCanvas` renders it with React Flow + dagre auto-layout. No new fetching or sync path.

**Tech Stack:** Next.js 16 (RSC) · React 19 · TypeScript · `@xyflow/react` (React Flow) · `@dagrejs/dagre` (layout) · Prisma 6 · Tailwind v4 · Vitest.

**Spec:** `docs/specs/2026-07-09-n8n-backoffice-phase1-design.md` (§2 Map, §4 Relationships) — Map was deferred; this plan delivers it.

**Design decisions (locked in brainstorming):**
- Rendering: React Flow + dagre. Nodes = workflows **and** systems (systems toggleable).
- SOP grouping: **included**, derived from `part-of-process` connected components; editable name per group stored in `ProcessGroup { key, name }`.
- Node coloring: **by risk** default, toggle to by-type / by-owner-team.

---

## Conventions

- **TDD for pure logic** (`graph.ts`, `process.ts`). Canvas UI = build + manual verify.
- **Fixtures reused:** derivation tests run against the existing anchor-scenario fixtures via `loadInstance()`'s demo path (`lib/demo/fixtures.ts`). No live creds.
- **No `any`.** New shared types live beside their module.
- Run tests: `pnpm test <path>`. Run app: `pnpm dev`. Typecheck/build: `pnpm build`.
- Match existing patterns: `import "server-only"` in data/store modules; `"use client"` in interactive components; theme tokens from `app/globals.css` (`--accent`, `--danger`, `text-faint`, `bg-panel-2`, etc.); tone helpers from `lib/format.ts`.

---

## File Structure

```
Create:
  lib/derive/process.ts          # connected-component clustering of part-of-process links (pure, TDD)
  lib/derive/graph.ts            # composeGraph: workflows+systems → {nodes,edges,groups} (pure, TDD)
  lib/data/map.ts                # loadMap(): server-only, wires loadInstance + store + composeGraph
  app/(backoffice)/map/page.tsx  # RSC: loadMap → <MapCanvas>
  components/map/MapCanvas.tsx   # "use client": React Flow wrapper, dagre layout, interactions
  components/map/WorkflowNode.tsx# custom workflow node (risk/type/owner color, health dot)
  components/map/SystemNode.tsx  # custom system node (pill)
  components/map/GroupNode.tsx   # SOP cluster container node (editable name)
  components/map/MapControls.tsx # color-by toggle, tier/system toggles, reset view
  components/map/layout.ts       # dagre layout helper: nodes+edges → positioned nodes
  components/map/legend.ts       # color scales + legend entries per color-by mode (shared pure helpers)
  test/derive/process.test.ts
  test/derive/graph.test.ts

Modify:
  prisma/schema.prisma           # + model ProcessGroup { key, name }
  lib/backoffice/store.ts        # + getAllLinks(), getProcessGroupNames(), setProcessGroupName()
  lib/backoffice/types.ts        # + ProcessGroupName type (if needed)
  app/api/process-groups/route.ts# PATCH: rename a group (Create)
  components/shell/SideNav.tsx    # /map: drop `soon`, make it a live link
```

---

## Chunk 0: Dependencies + store + schema

### Task 0.1: Install React Flow + dagre
**Files:** repo root
- [ ] Run: `pnpm add @xyflow/react @dagrejs/dagre`
- [ ] Verify: `node -e "require('@xyflow/react'); require('@dagrejs/dagre'); console.log('ok')"` prints `ok`.
- [ ] Commit: `chore: add react-flow + dagre for dependency map`.

### Task 0.2: ProcessGroup schema + migration
**Files:** Modify `prisma/schema.prisma`
- [ ] Add model:

```prisma
model ProcessGroup {
  key       String   @id            // canonical hash of sorted member workflow ids
  name      String
  updatedAt DateTime @updatedAt
}
```

- [ ] Regenerate client: `pnpm prisma generate` (dev uses SQLite `dev.db`; run `pnpm prisma db push` to sync the local db without a migration file, matching how the repo currently manages dev schema).
- [ ] Verify: `node -e "const {PrismaClient}=require('@prisma/client'); new PrismaClient().processGroup.findMany().then(r=>{console.log('ok',r.length);process.exit(0)})"` prints `ok 0`.
- [ ] Commit: `feat: ProcessGroup store model`.

### Task 0.3: Store functions — all links + group names
**Files:** Modify `lib/backoffice/store.ts`
- [ ] Add `getAllLinks()` (mirrors `getLinksFor` but no `where`):

```ts
export async function getAllLinks(): Promise<ManualLink[]> {
  const rows = await prisma.workflowLink.findMany();
  return rows.map((r) => ({ ...r, relation: r.relation as LinkRelation }));
}
```

- [ ] Add group-name read/write:

```ts
export async function getProcessGroupNames(): Promise<Map<string, string>> {
  const rows = await prisma.processGroup.findMany();
  return new Map(rows.map((r) => [r.key, r.name]));
}

export async function setProcessGroupName(key: string, name: string): Promise<void> {
  await prisma.processGroup.upsert({
    where: { key },
    create: { key, name },
    update: { name },
  });
}
```

- [ ] Verify: `pnpm build` typechecks (no test yet — thin wrappers).
- [ ] Commit: `feat: store fns for all-links + process group names`.

---

## Chunk 1: Graph derivation (TDD)

### Task 1.1: Process clustering (TDD)
**Files:** Create `lib/derive/process.ts`, `test/derive/process.test.ts`

- [ ] **Step 1 — write the failing test:**

```ts
import { describe, it, expect } from "vitest";
import { computeProcessGroups } from "@/lib/derive/process";
import type { ManualLink } from "@/lib/backoffice/types";

const link = (fromId: string, toId: string, relation = "part-of-process"): ManualLink => ({
  id: `${fromId}-${toId}`, fromId, toId, relation: relation as ManualLink["relation"], source: "manual",
});

describe("computeProcessGroups", () => {
  it("clusters transitively-linked workflows into one group", () => {
    const groups = computeProcessGroups(
      [link("a", "b"), link("b", "c")],
      new Map(),
    );
    expect(groups).toHaveLength(1);
    expect([...groups[0].workflowIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores non-process relations", () => {
    const groups = computeProcessGroups([link("a", "b", "depends-on")], new Map());
    expect(groups).toHaveLength(0);
  });

  it("produces a stable key from sorted members and attaches a stored name", () => {
    const g1 = computeProcessGroups([link("b", "a")], new Map())[0];
    const g2 = computeProcessGroups([link("a", "b")], new Map())[0];
    expect(g1.key).toEqual(g2.key); // order-independent
    const named = computeProcessGroups([link("a", "b")], new Map([[g1.key, "Refund Process"]]))[0];
    expect(named.name).toEqual("Refund Process");
  });

  it("falls back to a default name when unnamed", () => {
    const g = computeProcessGroups([link("a", "b")], new Map())[0];
    expect(g.name).toMatch(/process/i);
  });

  it("keeps separate components as separate groups", () => {
    const groups = computeProcessGroups([link("a", "b"), link("c", "d")], new Map());
    expect(groups).toHaveLength(2);
  });
});
```

- [ ] **Step 2 — run, verify it fails:** `pnpm test test/derive/process.test.ts` → FAIL (module not found).
- [ ] **Step 3 — implement `lib/derive/process.ts`:**

```ts
import type { ManualLink } from "@/lib/backoffice/types";

export interface ProcessGroup {
  key: string;             // stable id: "pg:" + sorted member ids joined by "|"
  name: string;
  workflowIds: string[];   // sorted
}

/** Union-find over `part-of-process` links → connected components. */
export function computeProcessGroups(
  links: ManualLink[],
  names: Map<string, string>,
): ProcessGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  for (const l of links) {
    if (l.relation !== "part-of-process") continue;
    union(l.fromId, l.toId);
  }

  const byRoot = new Map<string, Set<string>>();
  for (const node of parent.keys()) {
    const root = find(node);
    (byRoot.get(root) ?? byRoot.set(root, new Set()).get(root)!).add(node);
  }

  return [...byRoot.values()].map((set) => {
    const workflowIds = [...set].sort();
    const key = "pg:" + workflowIds.join("|");
    return { key, workflowIds, name: names.get(key) ?? "Business process" };
  }).sort((a, b) => a.key.localeCompare(b.key));
}
```

- [ ] **Step 4 — run, verify pass:** `pnpm test test/derive/process.test.ts` → PASS (5 tests).
- [ ] **Step 5 — commit:** `feat: process-group clustering from part-of-process links`.

### Task 1.2: Graph composition (TDD)
**Files:** Create `lib/derive/graph.ts`, `test/derive/graph.test.ts`

Node/edge model:

```ts
export type ColorBy = "risk" | "type" | "owner";

export interface WorkflowGraphNode {
  id: string;              // workflow id
  kind: "workflow";
  name: string;
  type: WorkflowType;
  risk: "high" | "medium" | "low";
  ownerTeam: string | null;
  recentFailures: number;
  groupKey: string | null; // parent SOP cluster, if any
}
export interface SystemGraphNode {
  id: string;              // "system:Slack"
  kind: "system";
  name: string;            // "Slack"
}
export type GraphNode = WorkflowGraphNode | SystemGraphNode;

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "calls" | "shares-credential" | "uses-system" | "manual";
  tier: "A" | "B" | "M";
  label?: string;          // e.g. credential name, relation, or system resource
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: ProcessGroup[];
}
```

- [ ] **Step 1 — write the failing test.** Build a small `N8nWorkflow[]` inline (or import a helper from the existing fixtures) covering: A calls B (Execute Workflow), A and C share a credential, A uses Slack (system edge), and a `part-of-process` link A–B. Assert:

```ts
import { describe, it, expect } from "vitest";
import { composeGraph } from "@/lib/derive/graph";

describe("composeGraph", () => {
  it("emits a workflow node per workflow with risk/type/owner", () => {
    const g = composeGraph(baseInput());
    const wf = g.nodes.filter((n) => n.kind === "workflow");
    expect(wf.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("emits a calls edge from Execute Workflow targets (tier A, arrow)", () => {
    const g = composeGraph(baseInput());
    expect(g.edges.some((e) => e.kind === "calls" && e.source === "a" && e.target === "b")).toBe(true);
  });

  it("emits one shared-credential edge per pair (tier A)", () => {
    const g = composeGraph(baseInput());
    const shared = g.edges.filter((e) => e.kind === "shares-credential");
    expect(shared).toHaveLength(1);
    expect([shared[0].source, shared[0].target].sort()).toEqual(["a", "c"]);
  });

  it("emits system nodes + uses-system edges, deduped across workflows (tier B)", () => {
    const g = composeGraph(baseInput());
    expect(g.nodes.filter((n) => n.kind === "system" && n.name === "Slack")).toHaveLength(1);
    expect(g.edges.some((e) => e.kind === "uses-system" && e.target === "system:Slack")).toBe(true);
  });

  it("emits manual edges (tier M) and assigns groupKey to grouped workflows", () => {
    const g = composeGraph(baseInput());
    expect(g.groups).toHaveLength(1);
    const a = g.nodes.find((n) => n.id === "a");
    expect(a && a.kind === "workflow" && a.groupKey).toEqual(g.groups[0].key);
  });
});
```

- [ ] **Step 2 — run, verify fails:** `pnpm test test/derive/graph.test.ts` → FAIL.
- [ ] **Step 3 — implement `composeGraph`** reusing existing extractors — do NOT re-derive edges by hand:
  - Import `workflowCallEdges`, `sharedCredentialEdges`, `systemEdges` from `lib/derive/edges.ts`.
  - Import `composeRegistry` (or reuse its per-item risk/type/owner) — simplest: call `composeRegistry({workflows,executions,owners,now})` to get `RegistryItem[]`, then map each to a `WorkflowGraphNode` (id, name, type, `risk.level`, `owner?.team ?? null`, `health.recentFailures`).
  - `calls` edges: `workflows.flatMap(workflowCallEdges)` → `{kind:"calls", tier:"A"}`.
  - `shares-credential` edges: `sharedCredentialEdges(workflows)` → dedupe already done per-pair; label = credentialName.
  - `uses-system`: `workflows.flatMap(systemEdges)`; create a `system:<Name>` node once per distinct system; edge target = that node; label = resource ?? undefined.
  - `manual` edges: from all manual links (any relation) → `{kind:"manual", tier:"M", label: relation}`.
  - groups: `computeProcessGroups(links, names)`; set each workflow node's `groupKey` by membership lookup.
  - **Signature:** `composeGraph(input: { workflows, executions, owners, links, groupNames, now })`.
  - Guard: only emit `calls`/manual edges when both endpoints exist in the workflow set (skip dangling target ids).
- [ ] **Step 4 — run, verify pass:** `pnpm test test/derive/graph.test.ts` → PASS.
- [ ] **Step 5 — commit:** `feat: graph composition (workflows + systems + groups)`.

---

## Chunk 2: Data load + route

### Task 2.1: loadMap server function
**Files:** Create `lib/data/map.ts`
- [ ] Implement (mirror `lib/data/load.ts` patterns; `import "server-only"`):

```ts
import "server-only";
import { loadInstance } from "./source";
import { getAllOwners, getAllLinks, getProcessGroupNames } from "@/lib/backoffice/store";
import { composeGraph, type WorkflowGraph } from "@/lib/derive/graph";

export interface MapView { graph: WorkflowGraph; live: boolean; }

export async function loadMap(): Promise<MapView> {
  const [{ workflows, executions, live }, owners, links, groupNames] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    getAllLinks(),
    getProcessGroupNames(),
  ]);
  const graph = composeGraph({ workflows, executions, owners, links, groupNames, now: Date.now() });
  return { graph, live };
}
```

- [ ] Verify: `pnpm build` typechecks.
- [ ] Commit: `feat: loadMap data function`.

### Task 2.2: Map route (RSC shell)
**Files:** Create `app/(backoffice)/map/page.tsx`
- [ ] RSC that calls `loadMap()` and renders `<MapCanvas graph={graph} live={live} />` inside a `PageHeader` ("Dependency Map", subtitle = counts). Add `export const dynamic = "force-dynamic";`. Use the same header/layout pattern as `registry/page.tsx`.
- [ ] Temporary body: render `<pre>{JSON.stringify(graph.nodes.length …)}</pre>` until MapCanvas exists (next chunk) — or stub `MapCanvas` returning a placeholder so the route compiles.
- [ ] Verify: `pnpm dev`, open `/map`, see header + node/edge counts (no crash).
- [ ] Commit: `feat: /map route shell`.

### Task 2.3: Activate nav link
**Files:** Modify `components/shell/SideNav.tsx`
- [ ] Change the Map item from `{ href: "/map", label: "Map", icon: "map", soon: true }` to drop `soon: true` (live link).
- [ ] Verify: `/map` highlights as active in the sidebar; no "soon" pill.
- [ ] Commit: `feat: activate Map nav link`.

---

## Chunk 3: React Flow canvas

> React Flow note: import `import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";` and `import "@xyflow/react/dist/style.css";` once (in MapCanvas). All canvas components are client-only (`"use client"`). Feed it already-positioned nodes from dagre; disable interactive dragging persistence (positions are derived, not saved).

### Task 3.1: dagre layout helper
**Files:** Create `components/map/layout.ts`
- [ ] Pure function `layout(nodes, edges, opts?) → nodes with {position:{x,y}}` using `@dagrejs/dagre` (`rankdir: "LR"`, sensible `nodesep`/`ranksep`, node width/height constants). Group (parent) nodes are laid out as React Flow parent nodes: compute child positions, then size each group to bound its children. Keep this the ONLY place that touches dagre.
- [ ] Verify: unit-smoke it (optional) or just `pnpm build`.
- [ ] Commit: `feat: dagre layout helper for map`.

### Task 3.2: Custom nodes
**Files:** Create `components/map/WorkflowNode.tsx`, `SystemNode.tsx`, `GroupNode.tsx`, `components/map/legend.ts`
- [ ] `legend.ts`: pure `colorFor(node, mode: ColorBy) → cssVarToken` + `legendEntries(mode)`. Risk → `--danger`/amber/muted; type → reuse `typeTone`; owner → hash team→palette, null→grey. No React here.
- [ ] `WorkflowNode`: card styled like registry rows (name, type pill, small health dot when `recentFailures>0`), border/accent from `colorFor`. React Flow `Handle`s on left/right. `title` tooltip with risk reasons.
- [ ] `SystemNode`: pill styled like a `Chip`, muted, `Handle`s.
- [ ] `GroupNode`: translucent bordered container with the process name as a label chip (top-left). Read-only in this task (editing comes in 4.2).
- [ ] Register in a `nodeTypes` map in MapCanvas.
- [ ] Verify: renders in `/map` (next task wires them).
- [ ] Commit: `feat: custom map nodes + color legend`.

### Task 3.3: MapCanvas wiring
**Files:** Create `components/map/MapCanvas.tsx` (replace stub)
- [ ] `"use client"`. Convert `graph` → React Flow `nodes`/`edges`:
  - Map `GraphNode` → RF node (`type: kind === "workflow" ? "workflow" : "system"`, `parentId: groupKey` for grouped workflows, `data` payload for the custom node).
  - Emit one RF group node per `ProcessGroup` (`type: "group"`).
  - Map `GraphEdge` → RF edge: `calls` = solid + arrow marker; `shares-credential` = dashed, no arrow; `uses-system` = dotted, muted; `manual` = solid accent, `label`.
  - Run `layout()` for positions.
- [ ] Render `<ReactFlow nodes edges nodeTypes fitView proOptions={{hideAttribution:true}}>` with `<Background/> <MiniMap/> <Controls/>`, dark theme via `colorMode="dark"` and CSS var overrides.
- [ ] Verify: `/map` shows the full graph — workflow boxes, system pills, cluster boxes, all edge styles; pan/zoom/minimap work.
- [ ] Commit: `feat: react-flow map canvas`.

---

## Chunk 4: Interactions, controls, group naming

### Task 4.1: Controls (color-by + filters)
**Files:** Create `components/map/MapControls.tsx`; wire state in `MapCanvas`
- [ ] Client state in MapCanvas: `colorBy: ColorBy` (default "risk"), `showSystems: boolean` (default true), `showHeuristic: boolean` (Tier-B/uses-system edges, default true).
- [ ] `MapControls`: segmented toggle for color-by (Risk / Type / Owner) + checkboxes "Show systems", "Show possible edges", + a live legend (from `legendEntries`), + "Reset view" (calls `fitView`). Style like existing filter chips.
- [ ] Filtering: when `showSystems` off, drop system nodes + their edges; when `showHeuristic` off, drop Tier-B edges. Re-run `layout()` on change (memoized on the filtered set).
- [ ] Verify: toggling recolors nodes and shows/hides systems/edges; legend updates.
- [ ] Commit: `feat: map controls — color-by + filters + legend`.

### Task 4.2: Click-through + hover highlight
**Files:** Modify `MapCanvas.tsx`
- [ ] `onNodeClick`: workflow node → `router.push('/workflow/' + id)`; system node → no-op (or highlight).
- [ ] Hover: on `onNodeMouseEnter`, compute neighbor id set from edges; set opacity-dim class on non-neighbors (nodes + edges); clear on leave. Keep it CSS-class driven for perf.
- [ ] Verify: clicking a workflow opens its Detail; hovering highlights its immediate neighbors.
- [ ] Commit: `feat: map click-through + neighbor highlight`.

### Task 4.3: Rename process group
**Files:** Create `app/api/process-groups/route.ts`; make `GroupNode` label editable
- [ ] Route `PATCH`: body `{ key, name }` → `setProcessGroupName(key, name)` → `{ ok: true }`. Validate `key` starts with `pg:` and `name` non-empty (trim, max ~60 chars). Follow the shape of `app/api/owners/route.ts`.
- [ ] `GroupNode`: click the label → inline text input → on blur/Enter `PATCH` then `router.refresh()`. Optimistic local update.
- [ ] Verify: rename a cluster, refresh — name persists (check `dev.db` ProcessGroup row).
- [ ] Commit: `feat: rename SOP process groups`.

### Task 4.4: Empty / not-connected states + polish
**Files:** `MapCanvas.tsx`, `map/page.tsx`
- [ ] If `graph.nodes` empty → friendly empty state ("No workflows yet — connect n8n or run demo"). If `!live` → small "demo data" badge (match how registry/brief indicate demo).
- [ ] Verify Refund Review Agent scenario reads well: agent + tools cluster, shared-credential dashed link, systems visible, risky node stands out in red.
- [ ] Commit: `feat: map empty/demo states + polish`.

---

## Chunk 5: Verify + close

### Task 5.1: Full green
- [ ] `pnpm test` → all pass (existing 37 + new process/graph tests).
- [ ] `pnpm build` → typechecks, `/map` in route list.
- [ ] Manual pass: `/map` loads, color-by toggles, systems toggle, hover highlight, click→Detail, rename group persists.
- [ ] Commit any fixups.

### Task 5.2: Docs
**Files:** `README.md` (Screens section), spec note
- [ ] Add Map to the screens list in `README.md`; note it renders the same derived edges as Detail's Relationships.
- [ ] Commit: `docs: document Map screen`.

---

## Testing summary
- **Unit (Vitest, fixture-backed):** `computeProcessGroups` (clustering, stable key, naming), `composeGraph` (node/edge composition, system dedup, group assignment, dangling guard).
- **Manual verify:** canvas render, layout, all edge styles, color-by/filter toggles, hover highlight, click-through, group rename persistence, empty/demo states.

## Risks / notes
- **React Flow + React 19 / Next 16:** `@xyflow/react` supports React 19; import its CSS once and keep all usage in `"use client"` files. If SSR complains, the canvas component is already client-only — the RSC only passes serializable `graph` data.
- **Layout of parent/child (group) nodes:** dagre doesn't natively nest; compute child layout first, then derive each group node's position/size to bound its children. Isolate all of this in `layout.ts` so the canvas stays declarative.
- **Positions are derived, not persisted** — no drag-to-save in this phase (YAGNI). Dragging is allowed for exploration but not saved.
- **SOP grouping depends on users creating `part-of-process` links** on Detail pages; with none, the map simply shows no clusters (valid state).
