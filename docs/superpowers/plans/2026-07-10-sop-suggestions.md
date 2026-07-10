# SOP Suggestions Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead-end deterministic graph tab with a suggestion engine that turns auto-detected workflow clusters into accept/dismiss SOP suggestions, surfaced in-app and pushed to Slack.

**Architecture:** A pure `computeSopSuggestions` derivation clusters workflows from call edges (strong) and shared data sources (possible), classifies each cluster against current SOP membership (`new-sop` / `add-to-sop` / skip), and filters dismissed ones by a stable id. A new `SopSuggestionState` Prisma model persists `dismissed`/`notified` state, mirroring `BriefItemState`. The in-app surface renders suggestion cards above the process table; a cron route posts un-notified suggestions to the owning team's Slack channel; the existing interactivity route grows accept/dismiss cases. UI and Slack call identical store functions.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Postgres, Vitest, Slack Web API (`@slack/web-api`), Zod.

**Design doc:** `docs/superpowers/specs/2026-07-10-sop-suggestions-design.md`

**Reused primitives (already in repo):**
- `lib/derive/process.ts` → `clusterByPairs`, `callProcessPairs`
- `lib/derive/edges.ts` → `sharedDataSourceGroups(workflows)` (returns `{system,resource,workflowIds[]}`)
- `lib/backoffice/store.ts` → `createSop`, `assignMember`, `listSops`, `setBriefState` (pattern)
- `lib/slack/post.ts` → `postBlocks(botToken, channel, blocks, text)`; `getSlackInstall()`; owners carry `slackChannelId`
- `app/api/slack/interactivity/route.ts` → switch on `action_id`, JSON `value`

---

## Chunk 1: Detection engine + persistence

### Task 1: `SopSuggestionState` model + store functions

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/backoffice/store.ts`
- Modify: `lib/backoffice/types.ts`

- [ ] **Step 1: Add the Prisma model.** Append to `prisma/schema.prisma`:

```prisma
/// Dismissed / notified state for an auto-generated SOP suggestion. `id` is the
/// stable suggestion hash (see lib/derive/suggestions.ts). No row = never acted on.
model SopSuggestionState {
  id        String   @id
  status    String // dismissed | notified
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Run the migration.**

Run: `npx prisma migrate dev --name sop_suggestion_state`
Expected: migration created + applied, client regenerated.

- [ ] **Step 3: Add the type.** In `lib/backoffice/types.ts`, near `BriefItemStatus`:

```ts
export type SopSuggestionStatus = "dismissed" | "notified";
```

- [ ] **Step 4: Add store functions.** In `lib/backoffice/store.ts` (import `SopSuggestionStatus`):

```ts
export async function getSuggestionStates(): Promise<Map<string, SopSuggestionStatus>> {
  const rows = await prisma.sopSuggestionState.findMany();
  return new Map(rows.map((r) => [r.id, r.status as SopSuggestionStatus]));
}

export async function setSuggestionState(
  id: string,
  status: SopSuggestionStatus,
): Promise<void> {
  await prisma.sopSuggestionState.upsert({
    where: { id },
    create: { id, status },
    update: { status },
  });
}
```

- [ ] **Step 5: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations lib/backoffice/store.ts lib/backoffice/types.ts
git commit -m "feat(store): SopSuggestionState model + dismissed/notified store fns"
```

### Task 2: `computeSopSuggestions` derivation

**Files:**
- Create: `lib/derive/suggestions.ts`
- Test: `test/derive/suggestions.test.ts`

Interface:

```ts
export type SuggestionConfidence = "strong" | "possible";
export type SuggestionKind = "new-sop" | "add-to-sop";

export interface SopSuggestion {
  id: string;               // stable: hash(sorted memberIds + kind + targetSopId)
  kind: SuggestionKind;
  confidence: SuggestionConfidence;
  memberIds: string[];      // sorted; for add-to-sop, the MISSING members only
  reason: string;           // e.g. "3 workflows call each other" | "share Postgres:orders"
  targetSopId: string | null;   // set iff add-to-sop
  targetSopName: string | null;
}

export interface SuggestionInput {
  clusters: Array<{ memberIds: string[]; confidence: SuggestionConfidence; reason: string }>;
  sopByWorkflow: Map<string, { id: string; name: string }>; // workflowId -> its SOP
  dismissed: Set<string>;   // suggestion ids already dismissed
}

export function classifySuggestions(input: SuggestionInput): SopSuggestion[];
```

- [ ] **Step 1: Write failing tests.** `test/derive/suggestions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifySuggestions, type SuggestionInput } from "@/lib/derive/suggestions";

const base = (over: Partial<SuggestionInput> = {}): SuggestionInput => ({
  clusters: [],
  sopByWorkflow: new Map(),
  dismissed: new Set(),
  ...over,
});

describe("classifySuggestions", () => {
  it("suggests a new SOP when no member is assigned", () => {
    const out = classifySuggestions(base({
      clusters: [{ memberIds: ["b", "a", "c"], confidence: "strong", reason: "call each other" }],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("new-sop");
    expect(out[0].memberIds).toEqual(["a", "b", "c"]); // sorted
    expect(out[0].targetSopId).toBeNull();
  });

  it("suggests add-to-sop when some members belong to exactly one SOP", () => {
    const out = classifySuggestions(base({
      clusters: [{ memberIds: ["a", "b", "c"], confidence: "strong", reason: "x" }],
      sopByWorkflow: new Map([["a", { id: "s1", name: "Refunds" }]]),
    }));
    expect(out[0].kind).toBe("add-to-sop");
    expect(out[0].targetSopId).toBe("s1");
    expect(out[0].memberIds).toEqual(["b", "c"]); // only the missing ones
  });

  it("skips clusters spanning two different SOPs", () => {
    const out = classifySuggestions(base({
      clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
      sopByWorkflow: new Map([
        ["a", { id: "s1", name: "A" }],
        ["b", { id: "s2", name: "B" }],
      ]),
    }));
    expect(out).toHaveLength(0);
  });

  it("skips add-to-sop when no members are actually missing", () => {
    const out = classifySuggestions(base({
      clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
      sopByWorkflow: new Map([
        ["a", { id: "s1", name: "A" }],
        ["b", { id: "s1", name: "A" }],
      ]),
    }));
    expect(out).toHaveLength(0);
  });

  it("filters out dismissed suggestions by stable id", () => {
    const first = classifySuggestions(base({
      clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
    }));
    const out = classifySuggestions(base({
      clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }],
      dismissed: new Set([first[0].id]),
    }));
    expect(out).toHaveLength(0);
  });

  it("gives the same id regardless of member order", () => {
    const a = classifySuggestions(base({ clusters: [{ memberIds: ["a", "b"], confidence: "strong", reason: "x" }] }));
    const b = classifySuggestions(base({ clusters: [{ memberIds: ["b", "a"], confidence: "strong", reason: "x" }] }));
    expect(a[0].id).toBe(b[0].id);
  });
});
```

- [ ] **Step 2: Run to verify fail.** Run: `npx vitest run test/derive/suggestions.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** `lib/derive/suggestions.ts`:

```ts
import { createHash } from "node:crypto";

export type SuggestionConfidence = "strong" | "possible";
export type SuggestionKind = "new-sop" | "add-to-sop";

export interface SopSuggestion {
  id: string;
  kind: SuggestionKind;
  confidence: SuggestionConfidence;
  memberIds: string[];
  reason: string;
  targetSopId: string | null;
  targetSopName: string | null;
}

export interface SuggestionInput {
  clusters: Array<{ memberIds: string[]; confidence: SuggestionConfidence; reason: string }>;
  sopByWorkflow: Map<string, { id: string; name: string }>;
  dismissed: Set<string>;
}

function suggestionId(memberIds: string[], kind: SuggestionKind, targetSopId: string | null): string {
  const canon = [...memberIds].sort().join("|");
  return createHash("sha1").update(`${kind}::${targetSopId ?? ""}::${canon}`).digest("hex").slice(0, 16);
}

export function classifySuggestions(input: SuggestionInput): SopSuggestion[] {
  const out: SopSuggestion[] = [];
  for (const cluster of input.clusters) {
    const members = [...cluster.memberIds].sort();
    const sops = new Map<string, string>(); // sopId -> name, among assigned members
    for (const id of members) {
      const sop = input.sopByWorkflow.get(id);
      if (sop) sops.set(sop.id, sop.name);
    }

    if (sops.size > 1) continue; // ambiguous — spans multiple SOPs

    let s: SopSuggestion;
    if (sops.size === 0) {
      const id = suggestionId(members, "new-sop", null);
      s = { id, kind: "new-sop", confidence: cluster.confidence, memberIds: members, reason: cluster.reason, targetSopId: null, targetSopName: null };
    } else {
      const [targetSopId, targetSopName] = [...sops.entries()][0];
      const missing = members.filter((id) => !input.sopByWorkflow.has(id));
      if (missing.length === 0) continue; // nothing to add
      const id = suggestionId(missing, "add-to-sop", targetSopId);
      s = { id, kind: "add-to-sop", confidence: cluster.confidence, memberIds: missing, reason: cluster.reason, targetSopId, targetSopName };
    }
    if (!input.dismissed.has(s.id)) out.push(s);
  }
  // strong first, then stable by id
  return out.sort((a, b) =>
    a.confidence === b.confidence ? a.id.localeCompare(b.id) : a.confidence === "strong" ? -1 : 1,
  );
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npx vitest run test/derive/suggestions.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/derive/suggestions.ts test/derive/suggestions.test.ts
git commit -m "feat(derive): classifySuggestions — cluster -> new-sop/add-to-sop with stable ids"
```

### Task 3: Cluster builder (call + data-source pairs → clusters)

**Files:**
- Modify: `lib/derive/suggestions.ts` (add `buildClusters`)
- Test: `test/derive/suggestions.test.ts` (add cases)

`buildClusters(workflows)` produces the `clusters` array `classifySuggestions` consumes. A cluster is a connected component; confidence is `strong` if it contains any call edge, else `possible`. Reuse `clusterByPairs` and `callProcessPairs` from `process.ts`, and `sharedDataSourceGroups` from `edges.ts` (turn each group's `workflowIds` into a fan of pairs `[ids[0], ids[i]]`).

- [ ] **Step 1: Add failing tests** for: two workflows that call each other → one strong cluster; two workflows sharing only a data source → one possible cluster; a call-connected pair that also shares data → single strong cluster (not two). Use minimal `N8nWorkflow` fixtures with an `executeWorkflow` node and a known system node (mirror `test/derive/process.test.ts` + `test/derive/edges.test.ts` fixtures).

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement `buildClusters`:**

```ts
import type { N8nWorkflow } from "@/lib/n8n/types";
import { clusterByPairs, callProcessPairs } from "./process";
import { sharedDataSourceGroups } from "./edges";

export function buildClusters(workflows: N8nWorkflow[]): SuggestionInput["clusters"] {
  const callPairs = callProcessPairs(workflows); // [from,to][]
  const callSet = new Set(callPairs.map(([a, b]) => [a, b].sort().join("|")));

  const dsGroups = sharedDataSourceGroups(workflows);
  const dsPairs: Array<[string, string]> = [];
  const dsReason = new Map<string, string>(); // "a|b" -> "share System:resource"
  for (const g of dsGroups) {
    const [head, ...rest] = g.workflowIds;
    for (const id of rest) {
      dsPairs.push([head, id]);
      dsReason.set([head, id].sort().join("|"), `share ${g.system}:${g.resource}`);
    }
  }

  const names = new Map<string, string>(); // clusterByPairs needs a names map; unused here
  const groups = clusterByPairs([...callPairs, ...dsPairs], names);

  return groups
    .filter((grp) => grp.workflowIds.length >= 2)
    .map((grp) => {
      const ids = grp.workflowIds;
      // strong if any intra-cluster pair is a call edge
      let strong = false;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          if (callSet.has([ids[i], ids[j]].sort().join("|"))) strong = true;
      const reason = strong
        ? `${ids.length} workflows call each other`
        : dsReason.get([ids[0], ids[1]].sort().join("|")) ?? "share a data source";
      return { memberIds: ids, confidence: strong ? ("strong" as const) : ("possible" as const), reason };
    });
}
```

Note: `clusterByPairs` is not exported yet — export it from `process.ts` in this step.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit.**

```bash
git add lib/derive/suggestions.ts lib/derive/process.ts test/derive/suggestions.test.ts
git commit -m "feat(derive): buildClusters from call + shared-data-source pairs"
```

---

## Chunk 2: Data loader + API endpoints

### Task 4: `loadSuggestions` in the map data layer

**Files:**
- Modify: `lib/data/map.ts`

- [ ] **Step 1: Implement.** Add `SuggestionsView` + `loadSuggestions` (no separate test — thin glue, covered by the pure derivation tests + manual verify):

```ts
import { buildClusters, classifySuggestions, type SopSuggestion } from "@/lib/derive/suggestions";
import { getSuggestionStates } from "@/lib/backoffice/store";

export interface SuggestionsView { suggestions: SopSuggestion[]; }

export async function loadSuggestions(): Promise<SuggestionsView> {
  const [{ workflows }, sops, states] = await Promise.all([loadInstance(), listSops(), getSuggestionStates()]);
  const sopByWorkflow = new Map<string, { id: string; name: string }>();
  for (const s of sops) for (const m of s.members) sopByWorkflow.set(m.workflowId, { id: s.id, name: s.name });
  const dismissed = new Set([...states].filter(([, v]) => v === "dismissed").map(([k]) => k));
  const suggestions = classifySuggestions({ clusters: buildClusters(workflows), sopByWorkflow, dismissed });
  return { suggestions };
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add lib/data/map.ts
git commit -m "feat(data): loadSuggestions — compute live SOP suggestions minus dismissed"
```

### Task 5: Endpoints — seed members on create, add members, dismiss

**Files:**
- Modify: `lib/backoffice/store.ts` (`createSop` gains optional members)
- Modify: `app/api/process-groups/route.ts` (accept `memberIds`)
- Create: `app/api/suggestions/dismiss/route.ts`

- [ ] **Step 1: Extend `createSop`** to accept members and assign them in order:

```ts
export async function createSop(name: string, memberIds: string[] = []): Promise<Sop> {
  const row = await prisma.processGroup.create({ data: { name } });
  for (let i = 0; i < memberIds.length; i++) await assignMember(memberIds[i], row.id, i);
  return { id: row.id, name: row.name, description: row.description, updatedAt: row.updatedAt.toISOString() };
}
```

- [ ] **Step 2: Accept `memberIds` in the create endpoint.** In `app/api/process-groups/route.ts`, extend `CreateBody`:

```ts
const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().min(1)).optional(),
});
// ...
const sop = await createSop(parsed.data.name, parsed.data.memberIds ?? []);
```

- [ ] **Step 3: Create the dismiss endpoint.** `app/api/suggestions/dismiss/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { setSuggestionState } from "@/lib/backoffice/store";

const Body = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await setSuggestionState(parsed.data.id, "dismissed");
  return NextResponse.json({ ok: true });
}
```

(Adding members to an existing SOP reuses the existing `POST /api/process-groups/members`, one call per missing workflow.)

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add lib/backoffice/store.ts app/api/process-groups/route.ts app/api/suggestions/dismiss/route.ts
git commit -m "feat(api): seed SOP members on create, dismiss-suggestion endpoint"
```

---

## Chunk 3: In-app surface

### Task 6: `SuggestedProcesses` component

**Files:**
- Create: `components/relationships/SuggestedProcesses.tsx`

- [ ] **Step 1: Implement.** Client component. Props: `{ suggestions: SopSuggestion[] }`. For each suggestion render a card: reason text, a confidence pill (`strong` = accent, `possible` = muted), and buttons:
  - `new-sop` → **Create SOP**: `POST /api/process-groups { name: autoName(reason, memberIds), memberIds }`, then `router.push('/map/sop/' + id)`.
  - `add-to-sop` → **Add to {targetSopName}**: for each `memberIds`, `POST /api/process-groups/members { workflowId, groupId: targetSopId }`, then `router.refresh()`.
  - both → **Dismiss**: `POST /api/suggestions/dismiss { id }`, then `router.refresh()`.
  - Auto-name helper: `Process: <n workflows>` placeholder, e.g. `` `Process (${memberIds.length} workflows)` `` — user renames via `SopRenameButton`. Match `ProcessTable` styling (border/panel classes). Render nothing if `suggestions.length === 0`.

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add components/relationships/SuggestedProcesses.tsx
git commit -m "feat(relationships): SuggestedProcesses card list (create / add / dismiss)"
```

### Task 7: Rewire the page — drop the deterministic tab

**Files:**
- Modify: `app/(backoffice)/map/page.tsx`
- Delete usage of: `components/map/ModeToggle` (from this page)

- [ ] **Step 1: Rewrite `map/page.tsx`** to a single view: remove the `?view=auto` branch, `MapCanvas`, `ModeToggle`, and `parseView`. Load groups + suggestions in parallel; render `<SuggestedProcesses>` above `<ProcessTable>`. Keep the `PageHeader` subtitle (process/unassigned counts) and the live/demo `Chip`.

```tsx
export default async function RelationshipsPage() {
  const [groups, { suggestions }] = await Promise.all([loadGroups(), loadSuggestions()]);
  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader title="Relationships" subtitle={/* existing counts */} actions={<Chip>{groups.live ? "Live instance" : "Demo data"}</Chip>} />
      <SuggestedProcesses suggestions={suggestions} />
      <ProcessTable {...groups} />
    </div>
  );
}
```

- [ ] **Step 2: Verify no dangling imports.** Run: `npx tsc --noEmit` and `grep -rn "view=auto\|ModeToggle" app components` — Expected: clean, no stray references (MapCanvas/graph.ts remain in tree unused, per design).

- [ ] **Step 3: Commit.**

```bash
git add app/(backoffice)/map/page.tsx
git commit -m "feat(relationships): single-view page — suggestions + process table, drop auto graph tab"
```

---

## Chunk 4: Slack push

### Task 8: Suggestion Slack blocks

**Files:**
- Modify: `lib/slack/blocks.ts`
- Test: `test/slack/suggestion-blocks.test.ts`

- [ ] **Step 1: Failing test** — `suggestionBlocks(suggestion, workflowNames)` returns a section with the reason + an actions block with two buttons whose `value` JSON round-trips `{ suggestionId, memberIds, kind, targetSopId, name }`, and `action_id` is `create_sop_from_suggestion` (new-sop) or `add_to_sop_suggestion` (add-to-sop), plus a `dismiss_suggestion` button.

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement `suggestionBlocks`** in `lib/slack/blocks.ts` following `briefItemBlocks` structure (section + actions). Button `value: JSON.stringify({...})`.

- [ ] **Step 4: Run to verify pass.** Run: `npx vitest run test/slack/suggestion-blocks.test.ts`.

- [ ] **Step 5: Commit.**

```bash
git add lib/slack/blocks.ts test/slack/suggestion-blocks.test.ts
git commit -m "feat(slack): suggestionBlocks — accept/dismiss Block Kit card"
```

### Task 9: Cron route — post un-notified suggestions

**Files:**
- Create: `lib/slack/suggestion-run.ts`
- Create: `app/api/cron/suggestions/route.ts`
- Modify: `vercel.json` (register the cron)

- [ ] **Step 1: Implement `runSuggestionSweep`** in `lib/slack/suggestion-run.ts` (server-only), mirroring `runNotifySweep`:
  - `getSlackInstall()` → bail if not connected.
  - Load workflows, sops, owners, suggestion states.
  - `classifySuggestions(...)` (same as loader, but do NOT filter `notified` out of *computation* — filter to those with no state row at all, i.e. not dismissed and not notified).
  - **Channel resolution:** collect owner `slackChannelId` for all `memberIds`; if they resolve to exactly one non-null channel, use it; else fall back to `process.env.SLACK_SUGGESTIONS_CHANNEL`; else skip this suggestion.
  - `postBlocks(install.botToken, channel, suggestionBlocks(s, names), s.reason)`, then `setSuggestionState(s.id, "notified")`.
  - Return `{ ok: true, posted }`.

- [ ] **Step 2: Create the route** `app/api/cron/suggestions/route.ts` — copy `cron/notify/route.ts` shape (CRON_SECRET guard, call `runSuggestionSweep`).

- [ ] **Step 3: Register cron** in `vercel.json` alongside the others (daily schedule, matching Hobby constraints noted in `cron/notify`).

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit`.

- [ ] **Step 5: Commit.**

```bash
git add lib/slack/suggestion-run.ts app/api/cron/suggestions/route.ts vercel.json
git commit -m "feat(slack): cron sweep posts un-notified SOP suggestions to owning team"
```

### Task 10: Interactivity — accept/dismiss from Slack

**Files:**
- Modify: `app/api/slack/interactivity/route.ts`

- [ ] **Step 1: Add three cases** to the switch (import `createSop`, `assignMember`, `setSuggestionState`):

```ts
case "create_sop_from_suggestion":
  if (value.memberIds) {
    const ids = JSON.parse(value.memberIds) as string[];
    await createSop(value.name || `Process (${ids.length} workflows)`, ids);
    if (value.suggestionId) await setSuggestionState(value.suggestionId, "notified");
  }
  text = "✓ SOP created in Backoffice.";
  break;
case "add_to_sop_suggestion":
  if (value.memberIds && value.targetSopId) {
    for (const id of JSON.parse(value.memberIds) as string[]) await assignMember(id, value.targetSopId);
  }
  text = "✓ Workflows added to the SOP.";
  break;
case "dismiss_suggestion":
  if (value.suggestionId) await setSuggestionState(value.suggestionId, "dismissed");
  text = "Suggestion dismissed.";
  break;
```

Note: `value` is `Record<string, string>`, so array fields are JSON strings — parse them. Confirm the button `value` in `suggestionBlocks` stringifies `memberIds` as a JSON string (adjust Task 8 if needed so the two agree).

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit`.

- [ ] **Step 3: Commit.**

```bash
git add app/api/slack/interactivity/route.ts
git commit -m "feat(slack): interactivity cases for create/add/dismiss suggestion"
```

---

## Chunk 5: Verification

### Task 11: Full test + build gate

- [ ] **Step 1: Run the whole suite.** Run: `npx vitest run` — Expected: all pass.
- [ ] **Step 2: Typecheck + lint.** Run: `npx tsc --noEmit && npm run lint` — Expected: clean.
- [ ] **Step 3: Build.** Run: `npm run build` — Expected: succeeds, `/map` renders.
- [ ] **Step 4: Manual smoke (if dev DB available).** `npm run dev`, open `/map`: suggestions appear above the table; **Create SOP** navigates to the new SOP detail; **Dismiss** removes the card and it stays gone after refresh.
- [ ] **Step 5: Final commit if any fixups.**

---

## Notes for the implementer

- **DB required.** Tasks 1, 4, 5, 9 touch Prisma/live data. If no dev DB, the migration + manual smoke can't run locally — flag it, keep the pure-derivation tests (Tasks 2, 3, 8) as the correctness gate, and leave the migration for a DB-connected run.
- **`clusterByPairs` export.** Task 3 exports it from `process.ts` — confirm nothing else assumed it private.
- **Value-encoding contract.** Slack button `value` must be a single JSON string; nested arrays (`memberIds`) are JSON-stringified *within* it. Tasks 8 and 10 must agree — they're the same contract on write/read.
- **Repo rule:** stage explicit paths, never `git add -A`.
