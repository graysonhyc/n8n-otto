# SOP Suggestions — design

**Date:** 2026-07-10
**Status:** approved, ready for planning

## Problem

The Relationships page has two tabs: a manual **SOP board** (`?view=groups`) and a
**deterministic graph** (`?view=auto`, `MapCanvas`). The deterministic graph is a
dead end — it visualizes auto-parsed call and credential edges but offers no
action. Users look at it and leave.

The connectivity it shows is the useful part. When workflows call each other or
share a data source, they usually *are* one business process — an SOP waiting to
be named. Today that signal is thrown at a canvas instead of driving anything.

## Goal

Turn deterministic connectivity from a *destination* into a *suggestion engine*.
Detected workflow clusters that are not yet an SOP surface as suggestions the team
can accept or dismiss — both in the app and pushed proactively to Slack. The
standalone deterministic graph tab is removed.

## Non-goals

- No new graph visualization. `MapCanvas`/`graph.ts` stay in the tree but stop
  being rendered by the route. (Deleting them is a possible follow-up.)
- No ML or fuzzy matching. Suggestions come only from exact structural signals.
- Clusters spanning two or more existing SOPs are ignored (ambiguous).

## Signals

A cluster is a connected component (union-find, reusing `clusterByPairs` from
`lib/derive/process.ts`) built from two pair sources:

| Source | Origin | Confidence |
|---|---|---|
| Execute-Workflow call edges | `callProcessPairs` (tier A) | **strong** |
| Shared data source | two workflows with a `SystemEdge` on the same `system`+`resource` (tier B) | **possible** |

A cluster's confidence is **strong** if it contains any call edge, else
**possible**.

## Suggestion types

For each cluster (size ≥ 2), inspect current SOP membership of its members:

- **`new-sop`** — no member belongs to any SOP. Suggest creating a new SOP from
  the whole cluster.
- **`add-to-sop`** — some members belong to exactly one existing SOP, the rest are
  unassigned. Suggest adding the missing members to that SOP.
- **Skip** — members span two or more different SOPs (ambiguous).

Each suggestion has a stable id: `hash(sorted memberIds + type + targetSopId)`.
This survives recomputation so a dismissal keeps sticking.

## Persistence

Mirror the existing brief-item dismissal pattern (`BriefItemStatus`,
`setBriefState`).

New Prisma model:

```
SopSuggestionState {
  id        String  @id        // the stable suggestion id
  status    String             // "dismissed" | "notified"
  updatedAt DateTime @updatedAt
}
```

- **`dismissed`** — user rejected it (UI or Slack). Detection filters these out.
- **`notified`** — the Slack cron has already posted it, so it is not reposted.

Accepted suggestions need no row: once members join the SOP, the cluster no longer
qualifies (`new-sop` members are now assigned; `add-to-sop` members are now in the
target). The condition is self-resolving.

Store functions: `setSuggestionState(id, status)`, `getSuggestionStates(): Map<id, status>`.

## In-app surface

**`app/(backoffice)/map/page.tsx`**
- Remove the `?view=auto` branch, `MapCanvas`, and `ModeToggle`. The page becomes a
  single view: suggestions on top, then the process table.
- Extend the groups loader to also compute suggestions (`loadSuggestions` in
  `lib/data/map.ts`), filtering out `dismissed`.

**`components/relationships/SuggestedProcesses.tsx`** (new)
- Card list above `ProcessTable`. One card per suggestion:
  - `new-sop`, strong: `⚡ 3 workflows call each other → [Create SOP] [Dismiss]`
  - `add-to-sop`, possible: `Workflow X shares Postgres:orders with "Refunds" → [Add to Refunds] [Dismiss]`
  - Strong vs possible styled distinctly (accent vs muted).
- **Create SOP** → `POST /api/process-groups` with `{ name, memberIds }` (extend the
  endpoint to accept seed members). New SOP is **auto-named** — derived from the
  cluster (longest common workflow-name prefix, else `Process: <first workflow>`).
  User renames later via the existing `SopRenameButton`.
- **Add to SOP** → add the missing members to the target SOP
  (`POST /api/process-groups/members`).
- **Dismiss** → `POST /api/suggestions/dismiss` → `setSuggestionState(id, "dismissed")`.

## Slack (proactive push)

**`app/api/cron/suggestions/route.ts`** (new, following the existing cron routes)
- Compute suggestions. Post each with **no** state row, then mark it `notified`.
- **Target channel:** if all cluster members share one owner team, post to that
  team's `slackChannelId`; otherwise fall back to an ops channel from env
  (`SLACK_SUGGESTIONS_CHANNEL`). Skip if neither resolves.
- Message: Block Kit card (via `lib/slack/blocks.ts`) with **Accept** / **Dismiss**
  buttons. Button `value = { suggestionId, memberIds, type, targetSopId, name }`.

**`app/api/slack/interactivity/route.ts`** (extend the switch)
- `create_sop_from_suggestion` → auto-name + create SOP with members.
- `add_to_sop_suggestion` → add members to `targetSopId`.
- `dismiss_suggestion` → `setSuggestionState(suggestionId, "dismissed")`.

All three call the same store functions the UI uses, so the two surfaces stay
consistent. Auto-naming works identically from a button (no text input needed).

## Build order

1. `SopSuggestionState` model + migration + store functions.
2. `lib/derive/suggestions.ts` + unit tests (both signals, all three outcomes,
   dismissal filtering, stable ids).
3. `loadSuggestions` + endpoints (`/api/process-groups` seed members,
   `/api/suggestions/dismiss`).
4. `SuggestedProcesses` component; strip `auto`/`ModeToggle` from the page.
5. Slack cron route + interactivity cases.

## Open follow-ups (not this build)

- Delete `MapCanvas.tsx` / `graph.ts` if nothing else uses them.
- Confidence tuning if `possible` suggestions prove noisy.
