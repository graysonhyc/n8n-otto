# Real-Time Attention Alerts (Hybrid) Implementation Plan

> **For Claude:** Steps use checkbox (`- [ ]`) syntax. TDD, frequent commits. `pnpm test` (vitest) after each implementation step. `npx prisma generate` after schema edits (no DB needed).

**Goal:** Post attention items in near-real-time — a shared, de-duplicated "notify new items" sweep driven by a daily poll cron and an instant n8n error webhook, so a workflow failure (or newly-detected change) reaches its owner channel without waiting for the 09:00 brief.

**Architecture:** One pure function `notifyNewItems(deps)` selects items that are new (not yet notified, not dismissed/acknowledged, have an owner channel) and re-arms keys whose condition has resolved. A thin server wrapper `runNotifySweep()` loads real data + effects and calls it. Three entry points call the wrapper: a daily poll cron, an n8n error webhook (full sweep, debounced), and the daily brief (marks notified so it never double-posts). A new `BriefNotification` table holds per-key "already told them" state; a `NotifySweep` row holds the debounce timestamp.

**Tech Stack:** TypeScript, Next.js (App Router, `after()`), Prisma/Postgres, `@slack/web-api`, vitest.

---

## Design notes / invariants

- **Dedup, not detection.** `buildBrief` already finds items. This feature only adds "have we sent it?" All new risk is in idempotency/re-arm → isolated in one pure, tested function.
- **`notified` is orthogonal to dismiss/ack** → its own table, not a new `BriefItemState.status` value.
- **Re-arm:** a notified key that is no longer in the current brief = resolved → delete its notification row, so a later recurrence re-alerts.
- **Suppression:** `dismissed` and `acknowledged` items are never (re)posted while present. (They clear naturally when the item resolves.)
- **Routing reuses feature #1:** post to `owner.slackChannelId`; items with no owner/channel (incl. `workflowId === null` shared-credential items) are skipped.
- **Hobby reality:** poll cron stays daily (`0 8 * * *`); bump to `*/15 * * * *` when on Pro. The webhook is the real-time driver and runs a *full* sweep, so one error event also catches new non-incident items.
- **Debounce** (webhook only): skip a sweep if one ran in the last N seconds; timestamp is written *before* the heavy load so concurrent webhooks debounce each other.

---

## File Structure

- Modify `prisma/schema.prisma` — add `BriefNotification`, `NotifySweep` models.
- Modify `lib/backoffice/store.ts` — `getNotifiedKeys`, `markNotified`, `clearNotified`, `getLastSweepAt`, `touchSweep`.
- Create `lib/slack/notify.ts` — pure `notifyNewItems(deps)` + server-only `runNotifySweep(opts)`.
- Create `app/api/cron/notify/route.ts` — `CRON_SECRET`, calls `runNotifySweep()`.
- Create `app/api/n8n/execution/route.ts` — shared-secret, `after()` → `runNotifySweep({ debounceMs })`.
- Modify `lib/slack/send-brief.ts` — `markNotified(item.key)` after posting each attention card.
- Modify `vercel.json` — add the daily notify cron.
- Create `docs/n8n-error-webhook.md` — how to wire n8n's Error Workflow.
- Test: `test/slack/notify.test.ts`.

---

## Chunk 1: State + pure sweep

### Task 1: Prisma models + store functions

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/backoffice/store.ts`

- [ ] **Step 1: Add models to `prisma/schema.prisma`** (after `BriefItemState`)

```prisma
/// Per-key "already notified" state for real-time attention alerts. A row means
/// we've posted this BriefItem; it is deleted when the item resolves (re-arm).
model BriefNotification {
  key        String   @id
  notifiedAt DateTime @default(now())
}

/// Single-row debounce marker for the notify sweep (id is always "default").
model NotifySweep {
  id        String   @id
  lastRunAt DateTime
}
```

- [ ] **Step 2: Regenerate the client**

Run: `npx prisma generate`
Expected: success (no DB connection needed for generate); `prisma.briefNotification` / `prisma.notifySweep` now typed.

- [ ] **Step 3: Add store functions to `lib/backoffice/store.ts`** (after the Brief item state section)

```ts
// ---- Real-time notification state ------------------------------------------

export async function getNotifiedKeys(): Promise<Set<string>> {
  const rows = await prisma.briefNotification.findMany({ select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

export async function markNotified(key: string): Promise<void> {
  await prisma.briefNotification.upsert({ where: { key }, create: { key }, update: {} });
}

export async function clearNotified(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.briefNotification.deleteMany({ where: { key: { in: keys } } });
}

export async function getLastSweepAt(): Promise<Date | null> {
  const row = await prisma.notifySweep.findUnique({ where: { id: "default" } });
  return row?.lastRunAt ?? null;
}

export async function touchSweep(): Promise<void> {
  const now = new Date();
  await prisma.notifySweep.upsert({
    where: { id: "default" },
    create: { id: "default", lastRunAt: now },
    update: { lastRunAt: now },
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/backoffice/store.ts
git commit -m "feat(store): notification + sweep-debounce state for real-time alerts"
```

> **Deploy note (not a code step):** the new tables need a migration on the real DB — run `npx prisma migrate dev --name brief-notifications` locally (or `npx prisma db push` if no shadow DB) before the cron/webhook can work. Tests below don't touch the DB.

---

### Task 2: Pure `notifyNewItems`

**Files:**
- Create: `lib/slack/notify.ts` (pure function only in this task)
- Test: `test/slack/notify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { notifyNewItems, type NotifyDeps } from "@/lib/slack/notify";
import type { BriefItem } from "@/lib/brief/build";
import type { Owner } from "@/lib/backoffice/types";

function item(key: string, workflowId: string | null): BriefItem {
  return {
    key, severity: "high", category: "incident", title: key,
    whatHappened: "", whyItMatters: "", suggestedOwner: "", recommendedAction: "",
    workflowId, actions: [],
  };
}
function owner(workflowId: string, channelId: string | null): Owner {
  return {
    workflowId, team: "Growth", slackChannelId: channelId, slackChannelName: channelId ? "#growth" : null,
    escalationChannelId: null, confirmed: true, reasoning: null, source: "confirmed",
  };
}
function deps(over: Partial<NotifyDeps>): NotifyDeps {
  return {
    items: [], owners: new Map(), notified: new Set(), states: new Map(),
    post: vi.fn(async () => {}), markNotified: vi.fn(async () => {}), clearNotified: vi.fn(async () => {}),
    ...over,
  };
}

describe("notifyNewItems", () => {
  it("posts a new owned item and marks it notified", async () => {
    const d = deps({
      items: [item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", "C1")]]),
    });
    const res = await notifyNewItems(d);
    expect(d.post).toHaveBeenCalledWith("C1", d.items[0]);
    expect(d.markNotified).toHaveBeenCalledWith("incident:w1");
    expect(res.posted).toBe(1);
  });

  it("skips items already notified", async () => {
    const d = deps({
      items: [item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", "C1")]]),
      notified: new Set(["incident:w1"]),
    });
    const res = await notifyNewItems(d);
    expect(d.post).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("skips dismissed and acknowledged items", async () => {
    const d = deps({
      items: [item("k:dismissed", "w1"), item("k:ack", "w2")],
      owners: new Map([["w1", owner("w1", "C1")], ["w2", owner("w2", "C2")]]),
      states: new Map([["k:dismissed", "dismissed"], ["k:ack", "acknowledged"]]),
    });
    const res = await notifyNewItems(d);
    expect(d.post).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("skips items with no owner channel (incl. null workflow)", async () => {
    const d = deps({
      items: [item("shared:c1", null), item("incident:w1", "w1")],
      owners: new Map([["w1", owner("w1", null)]]), // owner exists but no channel
    });
    const res = await notifyNewItems(d);
    expect(d.post).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("re-arms notified keys whose condition has resolved", async () => {
    const d = deps({
      items: [], // nothing current
      notified: new Set(["incident:gone", "incident:also-gone"]),
    });
    const res = await notifyNewItems(d);
    expect(d.clearNotified).toHaveBeenCalledWith(
      expect.arrayContaining(["incident:gone", "incident:also-gone"]),
    );
    expect(res.rearmed).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/slack/notify.test.ts`
Expected: FAIL — `notifyNewItems` not found.

- [ ] **Step 3: Implement the pure function** in `lib/slack/notify.ts`

```ts
import type { BriefItem } from "@/lib/brief/build";
import type { BriefItemStatus, Owner } from "@/lib/backoffice/types";

export interface NotifyDeps {
  items: BriefItem[];
  owners: Map<string, Owner>;
  notified: Set<string>;
  states: Map<string, BriefItemStatus>;
  post: (channelId: string, item: BriefItem) => Promise<void>;
  markNotified: (key: string) => Promise<void>;
  clearNotified: (keys: string[]) => Promise<void>;
}

// Decide what to post and what to re-arm. Pure over its injected deps: posts any
// item that is new (not yet notified), not suppressed (dismissed/acknowledged),
// and has an owner channel; deletes notification rows for keys no longer present
// so a recurrence re-alerts. Effects (post / mark / clear) are injected.
export async function notifyNewItems(deps: NotifyDeps): Promise<{ posted: number; rearmed: number }> {
  const currentKeys = new Set(deps.items.map((i) => i.key));

  // Re-arm: keys we notified about that are no longer produced by the brief.
  const resolved = [...deps.notified].filter((k) => !currentKeys.has(k));
  if (resolved.length > 0) await deps.clearNotified(resolved);

  let posted = 0;
  for (const item of deps.items) {
    if (deps.notified.has(item.key)) continue;
    const status = deps.states.get(item.key);
    if (status === "dismissed" || status === "acknowledged") continue;
    const channelId = item.workflowId ? deps.owners.get(item.workflowId)?.slackChannelId : null;
    if (!channelId) continue; // unowned / no channel → skipped
    await deps.post(channelId, item);
    await deps.markNotified(item.key);
    posted++;
  }

  return { posted, rearmed: resolved.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/slack/notify.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/slack/notify.ts test/slack/notify.test.ts
git commit -m "feat(slack): pure notifyNewItems sweep (dedup + re-arm)"
```

---

## Chunk 2: Wiring — wrapper, endpoints, dedup, cron

### Task 3: Server wrapper `runNotifySweep`

**Files:**
- Modify: `lib/slack/notify.ts` (append server-only wrapper)

- [ ] **Step 1: Append `runNotifySweep`** to `lib/slack/notify.ts`

```ts
import "server-only";
import {
  getAllOwners, getBriefStates, getSlackInstall,
  getNotifiedKeys, markNotified, clearNotified, getLastSweepAt, touchSweep,
} from "@/lib/backoffice/store";
import { loadBrief } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks } from "@/lib/slack/blocks";

export type SweepResult =
  | { ok: false; status: number; error: string }
  | { ok: true; posted: number; rearmed: number }
  | { ok: true; skipped: "debounced" };

// Loads live brief data + effects and runs the sweep. debounceMs > 0 skips the
// run when another sweep ran within the window (webhook chatter guard); the
// timestamp is written before the heavy load so concurrent calls debounce too.
export async function runNotifySweep(opts?: { debounceMs?: number }): Promise<SweepResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const debounceMs = opts?.debounceMs ?? 0;
  if (debounceMs > 0) {
    const last = await getLastSweepAt();
    if (last && Date.now() - last.getTime() < debounceMs) return { ok: true, skipped: "debounced" };
  }
  await touchSweep();

  const [{ items }, owners, notified, states] = await Promise.all([
    loadBrief(), getAllOwners(), getNotifiedKeys(), getBriefStates(),
  ]);

  const res = await notifyNewItems({
    items, owners, notified, states,
    post: (channelId, item) => postBlocks(install.botToken, channelId, briefItemBlocks(item), item.title),
    markNotified, clearNotified,
  });
  return { ok: true, ...res };
}
```

> Note: the `import "server-only"` line must sit at the top of the file at build time. When appending, move the existing pure-function imports and this block so `"server-only"` is line 1. The pure `notifyNewItems` stays exported and test-imports it directly (vitest ignores `server-only` via the existing test setup, as with `lib/data/brief.ts`). If vitest complains about `server-only`, split the wrapper into `lib/slack/notify-run.ts` instead and keep `lib/slack/notify.ts` pure. Prefer one file; split only if the test fails to import.

- [ ] **Step 2: Typecheck + existing tests**

Run: `npx tsc --noEmit && pnpm test test/slack/notify.test.ts`
Expected: exit 0; 5 tests still pass. **If the notify test now fails to import due to `server-only`, apply the split described above, then re-run.**

- [ ] **Step 3: Commit**

```bash
git add lib/slack/notify.ts
git commit -m "feat(slack): runNotifySweep server wrapper with debounce"
```

---

### Task 4: Poll cron + daily-brief dedup

**Files:**
- Create: `app/api/cron/notify/route.ts`
- Modify: `vercel.json`
- Modify: `lib/slack/send-brief.ts`

- [ ] **Step 1: Create the cron route** `app/api/cron/notify/route.ts` (mirror `cron/escalate`)

```ts
import { NextResponse } from "next/server";
import { runNotifySweep } from "@/lib/slack/notify";

// Poll driver. Daily on Hobby (see vercel.json); bump the schedule to */15 on
// Pro for true near-real-time. Guarded by CRON_SECRET like the other crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await runNotifySweep();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ran: "notify", ...result });
}
```

- [ ] **Step 2: Add the cron to `vercel.json`** (Hobby cap = daily; comment lives in the docs note)

```json
    {
      "path": "/api/cron/notify",
      "schedule": "0 8 * * *"
    }
```

- [ ] **Step 3: Dedup the daily brief** — in `lib/slack/send-brief.ts`, import `markNotified` and mark each attention card after posting so the sweep won't repost it.

```ts
import { markNotified } from "@/lib/backoffice/store";
// ...inside the `for (const item of ch.attention)` loop, after postBlocks:
      await markNotified(item.key);
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && pnpm test`
Expected: exit 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/notify/route.ts vercel.json lib/slack/send-brief.ts
git commit -m "feat(slack): daily notify poll cron + brief dedup via markNotified"
```

---

### Task 5: n8n error webhook

**Files:**
- Create: `app/api/n8n/execution/route.ts`
- Create: `docs/n8n-error-webhook.md`

- [ ] **Step 1: Create the webhook route** `app/api/n8n/execution/route.ts` (fail-closed secret; `after()` so n8n's HTTP node isn't blocked by the sweep)

```ts
import { after, NextResponse } from "next/server";
import { runNotifySweep } from "@/lib/slack/notify";

export const dynamic = "force-dynamic";

// n8n Error Workflow POSTs here on any workflow failure. We don't trust the body;
// it's just a signal to run a full sweep (which re-reads live n8n data and posts
// any new attention items). Debounced so a failing-in-a-loop workflow can't spam.
export async function POST(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const given = new URL(request.url).searchParams.get("secret") ?? request.headers.get("x-n8n-secret");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  after(async () => {
    await runNotifySweep({ debounceMs: 30_000 });
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the wiring doc** `docs/n8n-error-webhook.md`

```markdown
# Wiring n8n → real-time attention alerts

The Backoffice posts attention items in near-real-time when a workflow fails.
On Vercel Hobby (daily cron cap), this webhook is the real-time driver.

## One-time setup in n8n
1. Create a workflow named **"Backoffice error hook"** with a single **Error Trigger** node.
2. Add an **HTTP Request** node: `POST https://<your-app>/api/n8n/execution?secret=<N8N_WEBHOOK_SECRET>`.
3. In **Settings → Error Workflow** of every workflow you want covered (or the
   instance default), select "Backoffice error hook".

## Env
Set `N8N_WEBHOOK_SECRET` in Vercel (any long random string) to match the query
`?secret=` above. Requests without it get 401.

## Behaviour
Each error event triggers one **full** sweep (debounced to once per 30s), so it
also surfaces any new non-incident items (prompt/ownership/governance changes)
detected since the last run — not just the failure that fired it.
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit && pnpm test`
Expected: exit 0; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/n8n/execution/route.ts docs/n8n-error-webhook.md
git commit -m "feat(n8n): error webhook drives real-time attention sweep"
```

---

## Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit && pnpm test` — all green.
- [ ] **Step 2:** Confirm `.env`/Vercel has `N8N_WEBHOOK_SECRET` and `CRON_SECRET` documented (add to `.env.example` if one exists).
- [ ] **Step 3:** Reminder to the user: run the Prisma migration (`npx prisma migrate dev --name brief-notifications` or `db push`) against the real DB before the cron/webhook can persist state.
