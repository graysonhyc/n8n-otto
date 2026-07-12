import type { RegistryItem } from "@/lib/derive/registry";
import { blastRadius } from "@/lib/derive/blast";
import { estateLedger } from "@/lib/derive/ledger";
import { processStatus } from "@/lib/derive/processStatus";
import { workflowUrlFromEnv, executionsUrlFromEnv } from "@/lib/n8n/links";
import type { BriefItem } from "@/lib/brief/build";
import type { AgentContext } from "./context";

/** Caller→callee pairs from the graph's tier-A call edges. */
function callPairsOf(ctx: AgentContext): Array<[string, string]> {
  return ctx.graph.edges
    .filter((e) => e.kind === "calls")
    .map((e) => [e.source, e.target] as [string, string]);
}

// Expand a capability phrase into match keywords, so "can issue refunds" or
// "touches customer PII" resolve to the systems/tools that imply them.
const CAPABILITY_SYNONYMS: Record<string, string[]> = {
  refund: ["refund"],
  payment: ["stripe", "payment", "charge", "invoice", "billing"],
  money: ["stripe", "payment", "charge", "invoice", "refund"],
  email: ["gmail", "email", "outlook", "mail", "sendgrid"],
  pii: ["stripe", "zendesk", "hubspot", "gmail", "intercom", "salesforce", "customer"],
  customer: ["stripe", "zendesk", "hubspot", "gmail", "intercom", "salesforce"],
  crm: ["hubspot", "salesforce"],
  support: ["zendesk", "intercom"],
  slack: ["slack"],
};

function capabilityKeywords(phrase: string): string[] {
  const tokens = phrase.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const kw = new Set<string>();
  for (const t of tokens) {
    const singular = t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t;
    kw.add(t);
    kw.add(singular);
    for (const syn of CAPABILITY_SYNONYMS[singular] ?? CAPABILITY_SYNONYMS[t] ?? []) kw.add(syn);
  }
  return [...kw];
}

// Read-only tools the coworker can call. Each is a pure function of
// (args, context); no I/O here (action tools that hit Linear/n8n are added
// separately and injected). Kept DRY: one TOOLS array yields both the OpenAI
// function specs and the dispatch map.

export interface OpenAiToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

type ToolFn = (args: Record<string, unknown>, ctx: AgentContext) => unknown;

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: ToolFn;
}

// ---- compact projections (keep tool payloads small + business-readable) ----

function summariseItem(i: RegistryItem) {
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    active: i.active,
    criticality: i.criticality,
    systems: i.systems,
    owner: i.owner?.team ?? null,
    recentFailures: i.health.recentFailures,
    risk: i.risk.level,
  };
}

function detailItem(i: RegistryItem) {
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    active: i.active,
    criticality: i.criticality,
    trigger: i.trigger,
    model: i.model,
    systems: i.systems,
    tools: i.toolNames,
    hasHumanReview: i.humanInLoop,
    owner: i.owner?.team ?? null,
    slackChannel: i.owner?.slackChannelName ?? null,
    risk: i.risk,
    health: i.health,
    lastChange: i.lastChange,
    timeSavedPerExecution: i.timeSavedPerExecution,
    disconnectedNodes: i.disconnectedNodes,
  };
}

function attentionProjection(a: BriefItem, ctx: AgentContext) {
  const name = a.workflowId ? ctx.items.find((i) => i.id === a.workflowId)?.name ?? null : null;
  return {
    severity: a.severity,
    category: a.category,
    title: a.title,
    workflow: name,
    workflowId: a.workflowId,
    whatHappened: a.whatHappened,
    whyItMatters: a.whyItMatters,
    owner: a.suggestedOwner,
    recommendedAction: a.recommendedAction,
  };
}

function matches(i: RegistryItem, q: string): boolean {
  const hay = [
    i.name,
    i.type,
    i.trigger,
    i.owner?.team ?? "",
    ...i.systems,
    ...i.toolNames,
    ...i.tags,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

const TOOLS: Tool[] = [
  {
    name: "search_workflows",
    description:
      "Find workflows by free-text over name, system, tool, type, trigger, tag, or owning team. Use for 'what touches Stripe?', 'which agents can issue refunds?', 'what does RevOps own?'.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "search terms" } },
      required: ["query"],
    },
    run: (args, ctx) => {
      const q = String(args.query ?? "");
      const results = ctx.items.filter((i) => matches(i, q)).map(summariseItem);
      return { count: results.length, results };
    },
  },
  {
    name: "get_workflow_detail",
    description:
      "Full business-readable detail for one workflow id: type, owner, systems, tools, health, risk, last change, time saved.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run: (args, ctx) => {
      const id = String(args.id ?? "");
      const item = ctx.items.find((i) => i.id === id);
      return item ? detailItem(item) : { error: `No workflow with id ${id}` };
    },
  },
  {
    name: "get_blast_radius",
    description:
      "What is impacted if a workflow breaks or changes: downstream workflows (by name), systems, its business process, and every owner team that should be notified.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run: (args, ctx) => {
      const id = String(args.id ?? "");
      if (!ctx.items.some((i) => i.id === id)) return { error: `No workflow with id ${id}` };
      const b = blastRadius(id, ctx.graph);
      const nameOf = (wid: string) => ctx.items.find((i) => i.id === wid)?.name ?? wid;
      return {
        workflowId: b.workflowId,
        downstreamWorkflows: b.downstreamWorkflowIds.map((wid) => ({ id: wid, name: nameOf(wid) })),
        systems: b.systems,
        processGroup: b.processGroup ? b.processGroup.name : null,
        affectedOwnerTeams: b.affectedOwnerTeams,
      };
    },
  },
  {
    name: "estate_summary",
    description:
      "The Value & Waste ledger: how many workflows exist, hours saved in the recent window (ROI), the top contributors, and dead weight (idle or failing workflows) + unowned-critical count. Use for 'what is our automation estate worth?', 'what's wasting money?', 'give me the overview'.",
    parameters: {
      type: "object",
      properties: { windowDays: { type: "number", description: "ROI window in days (default 30)" } },
    },
    run: (args, ctx) => {
      const windowDays = typeof args.windowDays === "number" ? args.windowDays : 30;
      return estateLedger(ctx.items, ctx.executions, ctx.now, windowDays);
    },
  },
  {
    name: "get_attention_items",
    description:
      "The ranked 'what needs attention now' list — the same items the daily brief surfaces: incidents (repeated failures), unowned critical workflows, ungoverned AI agents with tool access, disconnected/dead steps, and shared-credential risks. Highest-severity first, each with why it matters + a recommended action. Use for 'what needs attention?', 'what did the brief say?', 'what's on fire?', 'anything I should look at?'. Optionally filter by severity.",
    parameters: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["high", "medium", "low"], description: "optional: only items at this severity" },
      },
    },
    run: (args, ctx) => {
      const sev = args.severity ? String(args.severity) : null;
      const items = ctx.attention.filter((a) => !sev || a.severity === sev);
      const bySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
      for (const a of ctx.attention) bySeverity[a.severity]++;
      return {
        total: ctx.attention.length,
        bySeverity,
        count: items.length,
        items: items.map((a) => attentionProjection(a, ctx)),
      };
    },
  },
  {
    name: "list_failures",
    description:
      "Recent failed executions rolled up per workflow: failure count, when it last failed, owner, and systems touched — most-failing first. Use for 'what errored this week?', 'show me failures', 'what's been failing?', 'which workflows are broken?'. Note: n8n's API exposes execution status + timing, not the error text — for the stack trace point the user to the executions view via open_in_n8n.",
    parameters: {
      type: "object",
      properties: { sinceDays: { type: "number", description: "window in days (default 7)" } },
    },
    run: (args, ctx) => {
      const sinceDays = typeof args.sinceDays === "number" ? args.sinceDays : 7;
      const cutoff = ctx.now - sinceDays * 86_400_000;
      const failed = ctx.executions.filter(
        (e) => (e.status === "error" || e.status === "crashed") && Date.parse(e.startedAt) >= cutoff,
      );
      const byWorkflow = new Map<string, { count: number; last: number }>();
      for (const e of failed) {
        const t = Date.parse(e.startedAt);
        const cur = byWorkflow.get(e.workflowId);
        if (!cur) byWorkflow.set(e.workflowId, { count: 1, last: t });
        else {
          cur.count++;
          if (t > cur.last) cur.last = t;
        }
      }
      const results = [...byWorkflow.entries()]
        .map(([id, { count, last }]) => {
          const item = ctx.items.find((i) => i.id === id);
          return {
            id,
            name: item?.name ?? id,
            owner: item?.owner?.team ?? null,
            systems: item?.systems ?? [],
            failures: count,
            lastFailureAt: new Date(last).toISOString(),
          };
        })
        .sort((a, b) => b.failures - a.failures);
      return { sinceDays, totalFailedExecutions: failed.length, workflowsAffected: results.length, results };
    },
  },
  {
    name: "list_by_capability",
    description:
      "Find workflows by what they can DO or touch, not just keywords: 'can issue refunds', 'touches customer PII', 'emails customers', 'talks to the CRM'. Returns matches with owner + criticality — the audit/security answer.",
    parameters: {
      type: "object",
      properties: { capability: { type: "string" } },
      required: ["capability"],
    },
    run: (args, ctx) => {
      const kws = capabilityKeywords(String(args.capability ?? ""));
      const results = ctx.items
        .filter((i) => kws.some((k) => matches(i, k)))
        .map((i) => ({ ...summariseItem(i), tools: i.toolNames }));
      return { capability: args.capability, matchedKeywords: kws, count: results.length, results };
    },
  },
  {
    name: "recent_changes",
    description:
      "Workflows edited within the last N days (default 7), newest first — 'what changed this week?'. For deep prompt/model/tool diffs, the daily brief carries those.",
    parameters: {
      type: "object",
      properties: { sinceDays: { type: "number" } },
    },
    run: (args, ctx) => {
      const sinceDays = typeof args.sinceDays === "number" ? args.sinceDays : 7;
      const cutoff = ctx.now - sinceDays * 86_400_000;
      const changed = ctx.items
        .filter((i) => i.lastChange && Date.parse(i.lastChange) >= cutoff)
        .map((i) => ({
          id: i.id,
          name: i.name,
          owner: i.owner?.team ?? null,
          lastChange: i.lastChange,
          daysAgo: Math.floor((ctx.now - Date.parse(i.lastChange as string)) / 86_400_000),
        }))
        .sort((a, b) => Date.parse(b.lastChange as string) - Date.parse(a.lastChange as string));
      return { sinceDays, count: changed.length, results: changed };
    },
  },
  {
    name: "open_in_n8n",
    description:
      "Get the n8n editor + executions deep-links for a workflow. Use for 'open X in n8n' and for replaying failures — n8n has no API retry, so point the user to the executions view to retry by hand.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run: (args, ctx) => {
      const id = String(args.id ?? "");
      const item = ctx.items.find((i) => i.id === id);
      if (!item) return { error: `No workflow with id ${id}` };
      return {
        name: item.name,
        editor: workflowUrlFromEnv(id),
        executions: executionsUrlFromEnv(id),
        note:
          item.health.recentFailures > 0
            ? `${item.health.recentFailures} recent failure(s) — open the executions view to inspect and retry.`
            : "No recent failures.",
      };
    },
  },
  {
    name: "list_processes",
    description:
      "List the business processes (chains of related workflows, auto-detected from call chains + manual links) with their end-to-end health. Use for 'what processes do we have?', 'which processes are broken?'.",
    parameters: { type: "object", properties: {} },
    run: (_args, ctx) => {
      const pairs = callPairsOf(ctx);
      const processes = ctx.graph.groups.map((g) => {
        const s = processStatus(g, ctx.items, pairs);
        return { key: g.key, name: g.name, steps: s.steps.length, health: s.health, owners: s.owners };
      });
      return { count: processes.length, processes };
    },
  },
  {
    name: "process_status",
    description:
      "End-to-end status of one business process: its ordered steps, health (healthy/degraded/stalled), where it's stalled, and the owner teams. Match by process name or by any member workflow name/id. Use for 'is the refund process healthy?', 'what's blocking the onboarding process?'.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "process name or a member workflow name/id" } },
      required: ["query"],
    },
    run: (args, ctx) => {
      const q = String(args.query ?? "").toLowerCase();
      const pairs = callPairsOf(ctx);
      const nameOf = (id: string) => ctx.items.find((i) => i.id === id)?.name.toLowerCase() ?? "";
      const group =
        ctx.graph.groups.find((g) => g.name.toLowerCase().includes(q)) ??
        ctx.graph.groups.find((g) => g.workflowIds.some((id) => id.toLowerCase() === q || nameOf(id).includes(q)));
      if (!group) return { error: `No process matches "${args.query}". Try list_processes.` };
      return processStatus(group, ctx.items, pairs);
    },
  },
  {
    name: "ownership_coverage",
    description:
      "Ownership health scorecard for the estate: what % of active workflows have a confirmed owner, the unowned-critical list, bus-factor (teams carrying many critical workflows), and stale ownership (owned but untouched for 90+ days). Use for 'how's our ownership coverage?', 'what's unowned?', 'where's the bus-factor risk?'.",
    parameters: { type: "object", properties: {} },
    run: (_args, ctx) => {
      const active = ctx.items.filter((i) => i.active);
      const owned = active.filter((i) => i.owner);
      const unownedCritical = active
        .filter((i) => !i.owner && i.criticality === "High")
        .map((i) => ({ id: i.id, name: i.name, systems: i.systems }));

      const criticalByTeam = new Map<string, number>();
      for (const i of active) {
        if (i.owner && i.criticality === "High") {
          criticalByTeam.set(i.owner.team, (criticalByTeam.get(i.owner.team) ?? 0) + 1);
        }
      }
      const busFactor = [...criticalByTeam.entries()]
        .filter(([, n]) => n >= 4)
        .map(([team, count]) => ({ team, criticalWorkflows: count }));

      const cutoff = ctx.now - 90 * 86_400_000;
      const staleOwnership = active
        .filter((i) => i.owner && i.lastChange && Date.parse(i.lastChange) < cutoff)
        .map((i) => ({ id: i.id, name: i.name, owner: i.owner!.team, lastChange: i.lastChange }));

      return {
        coveragePct: active.length ? Math.round((owned.length / active.length) * 100) : 100,
        activeWorkflows: active.length,
        owned: owned.length,
        unownedCritical,
        busFactor,
        staleOwnership,
      };
    },
  },
  {
    name: "credential_impact",
    description:
      "Shared-credential change-risk: which workflows share a credential, so you know what a rotation or key change would break. Query by credential name, or by a workflow id to see every credential it shares and the co-dependent workflows. Use for 'what breaks if we rotate the Stripe key?', 'what shares credentials with X?'.",
    parameters: {
      type: "object",
      properties: {
        credential: { type: "string", description: "credential name (substring ok)" },
        workflowId: { type: "string" },
      },
    },
    run: (args, ctx) => {
      const nameOf = (id: string) => ctx.items.find((i) => i.id === id)?.name ?? id;
      // Build credential name -> set of workflow ids from shared-credential edges.
      const byCred = new Map<string, Set<string>>();
      for (const e of ctx.graph.edges) {
        if (e.kind !== "shares-credential" || !e.label) continue;
        const set = byCred.get(e.label) ?? new Set<string>();
        set.add(e.source);
        set.add(e.target);
        byCred.set(e.label, set);
      }

      if (args.workflowId) {
        const wid = String(args.workflowId);
        const creds = [...byCred.entries()]
          .filter(([, set]) => set.has(wid))
          .map(([credential, set]) => ({
            credential,
            sharedWith: [...set].filter((id) => id !== wid).map((id) => ({ id, name: nameOf(id) })),
          }));
        return { workflow: nameOf(wid), sharedCredentials: creds };
      }

      const q = String(args.credential ?? "").toLowerCase();
      const results = [...byCred.entries()]
        .filter(([credential]) => !q || credential.toLowerCase().includes(q))
        .map(([credential, set]) => ({
          credential,
          workflowCount: set.size,
          workflows: [...set].map((id) => ({ id, name: nameOf(id) })),
          rotationRisk: set.size >= 3 ? "high" : set.size === 2 ? "medium" : "low",
        }));
      return { count: results.length, results };
    },
  },
  {
    name: "who_owns",
    description: "The owning team + Slack channel for a workflow, and whether ownership is confirmed.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run: (args, ctx) => {
      const id = String(args.id ?? "");
      const item = ctx.items.find((i) => i.id === id);
      if (!item) return { error: `No workflow with id ${id}` };
      return {
        name: item.name,
        owner: item.owner?.team ?? null,
        slackChannel: item.owner?.slackChannelName ?? null,
        confirmed: item.owner?.confirmed ?? false,
      };
    },
  },
];

export const toolSpecs: OpenAiToolSpec[] = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function dispatch(name: string, args: Record<string, unknown>, ctx: AgentContext): unknown {
  const tool = BY_NAME.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.run(args, ctx);
}
