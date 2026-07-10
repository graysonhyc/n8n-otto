# Team-Scoped, Otto-Narrated Daily Brief — Implementation Plan

> **For Claude:** Steps use checkbox (`- [ ]`) syntax. TDD, frequent commits. Run `pnpm test` (vitest) after each implementation step.

**Goal:** Replace the single estate-wide `#n8n-backoffice` daily brief with one AI-narrated brief per Slack channel, scoped to the workflows owned in that channel; workflows with no channel are skipped.

**Architecture:** Group `RegistryItem[]` by `owner.slackChannelId`. For each channel bucket, compute a scoped `DailyBrief` (the existing pure `computeDailyBrief` self-scopes on the passed items) and have Otto's LLM narrate it into Slack mrkdwn. Post the narrative + a deterministic ground-truth footer, then the channel's attention items as the existing interactive Block Kit cards. Drop the master-channel concept entirely.

**Tech Stack:** TypeScript, Next.js, OpenAI chat-completions (via the existing `ChatClient` seam + `openaiFromEnv()`), `@slack/web-api`, vitest.

---

## Design notes / invariants

- **Self-scoping compute:** `computeYesterday`/`computeToday`/`computeExploreNext` build a `byId` from the `items` they receive and skip executions/changes for unknown ids. So passing **scoped items + full executions + full changes** yields a correctly-scoped brief. Only `sharedCredentials` iterate independently — filter those to the channel.
- **Grouping key is the channel, not the team string.** `owner.slackChannelId` is the bucket key; `owner.slackChannelName` is the display label.
- **Skip unowned:** items with `owner?.slackChannelId == null` appear in no brief. Attention items with `workflowId == null` (shared-credential items) likewise drop — acceptable, they had no channel.
- **Hallucination guard:** `narrateBrief` sends only exact figures as JSON `DATA` and forbids inventing numbers/names; a deterministic footer with the raw stat line is always posted under the prose as ground truth.
- **No master channel:** delete `getMasterChannelId`/`resolveRouting` once unused. Escalation routes to `escalationChannelId ?? slackChannelId`, else skips.

---

## File Structure

- Create `lib/brief/channels.ts` — pure `groupBriefsByChannel(input) → ChannelBrief[]`.
- Create `lib/brief/narrate.ts` — `narrateBrief({daily, channelName, client, model?}) → Promise<string>` (Otto prose).
- Modify `lib/data/brief.ts` — add `loadChannelBriefs()` (gather data → `groupBriefsByChannel`).
- Modify `lib/slack/blocks.ts` — add `briefFooterBlock(daily)`; remove `dailyBriefBlocks` (+ now-dead helpers).
- Modify `lib/slack/send-brief.ts` — per-channel narrate + post loop; require `openaiFromEnv()`.
- Modify `lib/slack/escalate.ts` — drop master, route to escalation/owner channel, skip unowned.
- Modify `lib/slack/post.ts` — remove `getMasterChannelId` (after grep confirms unused).
- Remove `lib/slack/route.ts` + `test/slack/route.test.ts` (after grep confirms `resolveRouting` unused).
- Tests: `test/brief/channels.test.ts`, `test/brief/narrate.test.ts`.

---

## Task 1: Pure per-channel grouping

**Files:**
- Create: `lib/brief/channels.ts`
- Test: `test/brief/channels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { groupBriefsByChannel } from "@/lib/brief/channels";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/lib/demo/fixtures";
import type { Owner } from "@/lib/backoffice/types";

const NOW = Date.parse("2026-07-10T09:00:00+02:00");

function owner(workflowId: string, channelId: string | null, team = "Growth"): Owner {
  return {
    workflowId, team,
    slackChannelId: channelId,
    slackChannelName: channelId ? `#${team.toLowerCase()}` : null,
    escalationChannelId: null, confirmed: true, reasoning: null, source: "confirmed",
  };
}

describe("groupBriefsByChannel", () => {
  it("produces one brief per distinct channel and skips unowned workflows", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([
      [ids[0], owner(ids[0], "C_A")],
      [ids[1], owner(ids[1], "C_A")],
      [ids[2], owner(ids[2], "C_B")],
      // ids[3..] intentionally unowned → no channel
    ]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });

    const briefs = groupBriefsByChannel({
      items, executions, changes: new Map(), attention: [], sharedCredentials: [], now: NOW,
    });

    const channels = briefs.map((b) => b.channelId).sort();
    expect(channels).toEqual(["C_A", "C_B"]);
    expect(briefs.every((b) => b.daily.yesterday !== undefined)).toBe(true);
  });

  it("scopes yesterday stats to only the channel's workflows", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([[ids[0], owner(ids[0], "C_ONLY")]]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const briefs = groupBriefsByChannel({
      items, executions, changes: new Map(), attention: [], sharedCredentials: [], now: NOW,
    });
    expect(briefs).toHaveLength(1);
    // active workflows counted must be ≤ 1 (only the single owned+active one, if it ran)
    expect(briefs[0].daily.yesterday.activeWorkflows).toBeLessThanOrEqual(1);
  });

  it("routes attention items to their workflow's channel only", () => {
    const ids = allWorkflows.map((w) => w.id);
    const owners = new Map<string, Owner>([
      [ids[0], owner(ids[0], "C_A")],
      [ids[1], owner(ids[1], "C_B")],
    ]);
    const items = composeRegistry({ workflows: allWorkflows, executions, owners, now: NOW });
    const attention = [
      { key: "k1", severity: "high" as const, category: "incident" as const, title: "x",
        whatHappened: "", whyItMatters: "", suggestedOwner: "", recommendedAction: "",
        workflowId: ids[0], actions: [] },
    ];
    const briefs = groupBriefsByChannel({
      items, executions, changes: new Map(), attention, sharedCredentials: [], now: NOW,
    });
    const a = briefs.find((b) => b.channelId === "C_A")!;
    const b = briefs.find((b) => b.channelId === "C_B")!;
    expect(a.attention).toHaveLength(1);
    expect(b.attention).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/brief/channels.test.ts`
Expected: FAIL — `groupBriefsByChannel` not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { N8nExecution } from "@/lib/n8n/types";
import type { RegistryItem } from "@/lib/derive/registry";
import type { ChangeEvent } from "@/lib/diff/snapshot";
import type { BriefItem, SharedCredentialInfo } from "./build";
import { computeDailyBrief, type DailyBrief } from "./daily";

export interface ChannelBrief {
  channelId: string;
  channelName: string | null;
  daily: DailyBrief;
  attention: BriefItem[];
}

// Split the estate into one brief per Slack channel. The channel comes from each
// workflow's owner assignment (owner.slackChannelId); workflows with no channel
// are skipped entirely. computeDailyBrief self-scopes on the items passed, so we
// only need to filter items, shared credentials, and attention per channel.
export function groupBriefsByChannel(input: {
  items: RegistryItem[];
  executions: N8nExecution[];
  changes: Map<string, ChangeEvent[]>;
  attention: BriefItem[];
  sharedCredentials: SharedCredentialInfo[];
  now: number;
  offsetMin?: number;
}): ChannelBrief[] {
  const buckets = new Map<string, { channelName: string | null; ids: Set<string> }>();
  for (const item of input.items) {
    const channelId = item.owner?.slackChannelId;
    if (!channelId) continue;
    let b = buckets.get(channelId);
    if (!b) {
      b = { channelName: item.owner?.slackChannelName ?? null, ids: new Set() };
      buckets.set(channelId, b);
    }
    b.ids.add(item.id);
  }

  const out: ChannelBrief[] = [];
  for (const [channelId, { channelName, ids }] of buckets) {
    const items = input.items.filter((i) => ids.has(i.id));
    const sharedCredentials = input.sharedCredentials.filter((c) =>
      c.workflowIds.some((id) => ids.has(id)),
    );
    const attention = input.attention.filter((a) => a.workflowId != null && ids.has(a.workflowId));
    const daily = computeDailyBrief({
      items,
      executions: input.executions,
      changes: input.changes,
      attention,
      sharedCredentials,
      now: input.now,
      offsetMin: input.offsetMin,
    });
    out.push({ channelId, channelName, daily, attention });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/brief/channels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brief/channels.ts test/brief/channels.test.ts
git commit -m "feat(brief): group daily brief per Slack channel, skip unowned"
```

---

## Task 2: Otto narration of a scoped brief

**Files:**
- Create: `lib/brief/narrate.ts`
- Test: `test/brief/narrate.test.ts`

- [ ] **Step 1: Write the failing test** (stub `ChatClient`, same pattern as `test/agent/run.test.ts`)

```ts
import { describe, expect, it, vi } from "vitest";
import { narrateBrief } from "@/lib/brief/narrate";
import type { ChatClient } from "@/lib/agent/run";
import { computeDailyBrief } from "@/lib/brief/daily";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/lib/demo/fixtures";

const NOW = Date.parse("2026-07-10T09:00:00+02:00");
const items = composeRegistry({ workflows: allWorkflows, executions, owners: new Map(), now: NOW });
const daily = computeDailyBrief({ items, executions, changes: new Map(), attention: [], sharedCredentials: [], now: NOW });

function reply(content: string) {
  return { choices: [{ message: { role: "assistant", content } }] };
}

describe("narrateBrief", () => {
  it("returns the model's prose and feeds exact figures in the prompt", async () => {
    const create = vi.fn().mockResolvedValueOnce(reply("Yesterday was steady. 88 runs, 6 errors."));
    const client: ChatClient = { create };

    const text = await narrateBrief({ daily, channelName: "#growth", client });

    expect(text).toContain("88 runs");
    const sent = create.mock.calls[0][0];
    // exact yesterday figures must be present in the DATA we send
    const payload = JSON.stringify(sent.messages);
    expect(payload).toContain(String(daily.yesterday.runs));
    // must forbid inventing numbers
    expect(payload.toLowerCase()).toContain("never invent");
    // single completion, no tools
    expect(sent.tools).toBeUndefined();
  });

  it("falls back to a deterministic line when the model returns nothing", async () => {
    const create = vi.fn().mockResolvedValueOnce(reply(""));
    const client: ChatClient = { create };
    const text = await narrateBrief({ daily, channelName: "#growth", client });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(String(daily.yesterday.runs));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/brief/narrate.test.ts`
Expected: FAIL — `narrateBrief` not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { ChatClient } from "@/lib/agent/run";
import type { DailyBrief } from "./daily";

const SYSTEM = `You are n8n Otto, the n8n Backoffice coworker, writing a team's morning brief in a Slack channel.
Write in Slack mrkdwn (single *asterisks* for bold), warm but concise, a coworker not a report generator.
Cover, in this order and only if non-empty: yesterday's performance, today's plan (scheduled + changes), and 1–3 "explore next" suggestions.
Rules:
- Use ONLY the numbers, workflow names, and facts in DATA. NEVER invent metrics, workflows, owners, or systems.
- If DATA shows no runs, say so plainly and keep it short.
- No preamble, no "here is your brief". Open with the single most useful takeaway.
- End with one short line inviting them to ask you (e.g. "Ask me what breaks if X fails.").`;

// Compact, exact figures only — this is the ground truth the model may use.
function briefData(daily: DailyBrief, channelName: string | null) {
  const y = daily.yesterday;
  return {
    channel: channelName,
    yesterday: {
      date: y.dateLabel, runs: y.runs, successes: y.successes, errors: y.errors,
      errorPct: y.errorPct, tasksSolved: y.tasksSolved, timeSavedMinutes: y.timeSavedMinutes,
      timeSavedEstimated: y.timeSavedEstimated, activeWorkflows: y.activeWorkflows,
      topRunners: y.topRunners.map((s) => ({ name: s.name, runs: s.runs })),
      topErrorSources: y.topErrorSources.map((s) => ({ name: s.name, errors: s.errors })),
    },
    today: {
      scheduled: daily.today.scheduled.map((s) => s.name),
      changes: daily.today.changes.map((c) => ({ name: c.name, detail: c.detail })),
      attentionCount: daily.today.attention.length,
      highCount: daily.today.attention.filter((a) => a.severity === "high").length,
    },
    exploreNext: daily.exploreNext.map((e) => ({ title: e.title, detail: e.detail ?? null })),
  };
}

function deterministicLine(daily: DailyBrief): string {
  const y = daily.yesterday;
  if (y.runs === 0) return `*Yesterday (${y.dateLabel}):* no production runs.`;
  const pct = Math.round((y.successes / y.runs) * 100);
  return `*Yesterday (${y.dateLabel}):* ${y.runs} runs · ${pct}% success · ${y.errors} errors.`;
}

// Turn a scoped DailyBrief into Otto-voice Slack mrkdwn. Injectable client keeps
// it unit-testable; empty model output falls back to a deterministic summary.
export async function narrateBrief(input: {
  daily: DailyBrief;
  channelName: string | null;
  client: ChatClient;
  model?: string;
}): Promise<string> {
  const model = input.model || process.env.OTTO_MODEL || process.env.OPENAI_MODEL || "gpt-4.1";
  const data = briefData(input.daily, input.channelName);
  const res = await input.client.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `DATA:\n${JSON.stringify(data, null, 2)}` },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : deterministicLine(input.daily);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/brief/narrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brief/narrate.ts test/brief/narrate.test.ts
git commit -m "feat(brief): Otto-narrated brief prose with exact-figure guardrails"
```

---

## Task 3: Ground-truth footer block

**Files:**
- Modify: `lib/slack/blocks.ts`

- [ ] **Step 1: Add `briefFooterBlock`** (reuse existing `fmtMinutes`, `fmtDuration`, `section` is not needed — use a context block)

```ts
// Deterministic ground-truth footer posted under Otto's prose so the exact
// numbers are always verifiable even if the narrative drifts.
export function briefFooterBlock(daily: DailyBrief): KnownBlock {
  const y = daily.yesterday;
  const successPct = y.runs ? Math.round((y.successes / y.runs) * 100) : 100;
  const savedNote = y.timeSavedEstimated ? " (est)" : "";
  const line =
    y.runs === 0
      ? `No production runs yesterday (${y.dateLabel})`
      : `${y.dateLabel}: ${y.runs} runs · ${successPct}% success · ${y.errors} errors · ~${fmtMinutes(
          y.timeSavedMinutes,
        )} saved${savedNote} · ${y.activeWorkflows} active`;
  return { type: "context", elements: [{ type: "mrkdwn", text: `📊 ${line}` }] };
}
```

- [ ] **Step 2: Remove `dailyBriefBlocks`** and any helper left unused by its removal (`statLine`, `divider` — keep `section`, `fmtMinutes`, `fmtDuration` which stay in use). Verify with a grep in Step 3.

- [ ] **Step 3: Typecheck + unused check**

Run: `grep -rn "dailyBriefBlocks\|statLine" lib app test` → expect no remaining references (send-brief is updated in Task 4; if it still references, that's fixed there). Run `pnpm test` to confirm nothing else broke.

- [ ] **Step 4: Commit** (bundle with Task 4 if send-brief still imports the removed symbol — otherwise commit now)

```bash
git add lib/slack/blocks.ts
git commit -m "feat(slack): brief footer block; drop estate-wide dailyBriefBlocks"
```

---

## Task 4: Per-channel send in `send-brief.ts`

**Files:**
- Modify: `lib/data/brief.ts` (add `loadChannelBriefs`)
- Modify: `lib/slack/send-brief.ts`

- [ ] **Step 1: Add `loadChannelBriefs()` to `lib/data/brief.ts`** — mirror `loadDailyBrief`'s data-gathering, but return channel briefs. Factor the shared gather if clean; otherwise duplicate the `Promise.all` (it already appears twice — acceptable pattern in this file).

```ts
import { groupBriefsByChannel, type ChannelBrief } from "@/lib/brief/channels";

export interface ChannelBriefsView {
  channels: ChannelBrief[];
  live: boolean;
  scanned: number;
}

export async function loadChannelBriefs(): Promise<ChannelBriefsView> {
  const [{ workflows, executions, live }, owners, states, links, groupNames, { changes, scanned }] =
    await Promise.all([
      loadInstance(), getAllOwners(), getBriefStates(), getAllLinks(), getProcessGroupNames(), runSync(),
    ]);

  const now = live ? Date.now() : DEMO_NOW;
  const items = composeRegistry({ workflows, executions, owners, now });
  const sharedCredentials = credentialGroups(workflows);
  const blastById = blastMap(workflows, executions, owners, links, groupNames, now);

  const attention = buildBrief({ items, changes, sharedCredentials, blastById }).filter(
    (b) => states.get(b.key) !== "dismissed",
  );

  const channels = groupBriefsByChannel({ items, executions, changes, attention, sharedCredentials, now });
  return { channels, live, scanned };
}
```

- [ ] **Step 2: Rewrite `sendDailyBrief()`** in `lib/slack/send-brief.ts`

```ts
import "server-only";
import { getSlackInstall } from "@/lib/backoffice/store";
import { loadChannelBriefs } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks, briefFooterBlock } from "@/lib/slack/blocks";
import { narrateBrief } from "@/lib/brief/narrate";
import { openaiFromEnv } from "@/lib/agent/openai";

export type SendBriefResult =
  | { ok: false; status: number; error: string }
  | { ok: true; channels: number; posted: number };

// Posts one Otto-narrated daily brief per Slack channel (scoped to the workflows
// owned in that channel), then the channel's attention items as interactive
// cards. Workflows with no channel are skipped. No master channel.
export async function sendDailyBrief(): Promise<SendBriefResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const openai = openaiFromEnv();
  if (!openai) return { ok: false, status: 400, error: "OPENAI_API_KEY not set — Otto can't write the brief" };

  const { channels } = await loadChannelBriefs();

  let posted = 0;
  for (const ch of channels) {
    const prose = await narrateBrief({ daily: ch.daily, channelName: ch.channelName, client: openai });
    await postBlocks(
      install.botToken,
      ch.channelId,
      [
        { type: "section", text: { type: "mrkdwn", text: prose } },
        briefFooterBlock(ch.daily),
      ],
      "n8n Otto — Daily Brief",
    );
    for (const item of ch.attention) {
      await postBlocks(install.botToken, ch.channelId, briefItemBlocks(item), item.title);
      posted++;
    }
  }

  return { ok: true, channels: channels.length, posted };
}
```

- [ ] **Step 3: Fix callers of `SendBriefResult`.** Run `grep -rn "sendDailyBrief\|\.routed\|\.posted\|\.channel\b" app/api` — update `app/api/slack/brief/route.ts` and `app/api/cron/brief/route.ts` to the new shape (they most likely just `NextResponse.json(result)`; confirm no field access on `.routed`/`.channel`).

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS (no test imports `dailyBriefBlocks`).

- [ ] **Step 5: Typecheck the app**

Run: `pnpm build` (or `npx tsc --noEmit` if faster) — expect no type errors from the removed symbols/new shape.

- [ ] **Step 6: Commit**

```bash
git add lib/data/brief.ts lib/slack/send-brief.ts app/api/slack/brief/route.ts app/api/cron/brief/route.ts
git commit -m "feat(slack): send one Otto-narrated brief per channel"
```

---

## Task 5: Escalation without a master channel

**Files:**
- Modify: `lib/slack/escalate.ts`

- [ ] **Step 1: Drop master + `resolveRouting`.** Route each pending high item to `owner.escalationChannelId ?? owner.slackChannelId`; if neither, skip.

```ts
import "server-only";
import { getAllOwners, getBriefStates, getSlackInstall } from "@/lib/backoffice/store";
import { loadDailyBrief } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks } from "@/lib/slack/blocks";

export type EscalateResult =
  | { ok: false; status: number; error: string }
  | { ok: true; escalated: number };

export async function escalateUnacked(): Promise<EscalateResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const [{ attention }, owners, states] = await Promise.all([
    loadDailyBrief(), getAllOwners(), getBriefStates(),
  ]);

  const pending = attention.filter((i) => i.severity === "high" && states.get(i.key) !== "acknowledged");

  let escalated = 0;
  for (const item of pending) {
    const owner = item.workflowId ? owners.get(item.workflowId) ?? null : null;
    const channelId = owner?.escalationChannelId ?? owner?.slackChannelId;
    if (!channelId) continue; // unowned → skipped
    await postBlocks(install.botToken, channelId, briefItemBlocks(item, "⏫ Escalation — still unacknowledged"), `Escalation: ${item.title}`);
    escalated++;
  }

  return { ok: true, escalated };
}
```

Note: `loadDailyBrief` still exists and is used here for the estate-wide `attention` list. Keep it.

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/slack/escalate.ts
git commit -m "feat(slack): escalate to owner/escalation channel, skip unowned"
```

---

## Task 6: Remove dead master-channel code

**Files:**
- Modify: `lib/slack/post.ts`
- Remove: `lib/slack/route.ts`, `test/slack/route.test.ts` (if unused)

- [ ] **Step 1: Confirm unused.** Run `grep -rn "getMasterChannelId\|resolveRouting\|SLACK_MASTER_CHANNEL_ID" lib app test`. Expect only the definitions (+ `route.test.ts`) remain.

- [ ] **Step 2: Delete `getMasterChannelId` from `lib/slack/post.ts`** (keep `slackClient`, `postBlocks`). Delete `lib/slack/route.ts` and `test/slack/route.test.ts` if `resolveRouting` has no remaining references.

- [ ] **Step 3: Run full suite + build**

Run: `pnpm test && pnpm build`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(slack): remove master-channel routing (now per-channel)"
```

---

## Task 7: Manual sanity check

- [ ] **Step 1:** Re-read `app/api/cron/brief/route.ts`, `app/api/slack/brief/route.ts` responses — confirm they surface the new `{ channels, posted }` shape sensibly (adjust any user-facing string like "posted to #n8n-backoffice").
- [ ] **Step 2:** If a manual "Send to Slack" success toast/message names `#n8n-backoffice`, update copy to reflect per-channel sending (grep `n8n-backoffice` in `components/` and `app/`).
- [ ] **Step 3:** Final `pnpm test && pnpm build`; commit any copy fixes.
