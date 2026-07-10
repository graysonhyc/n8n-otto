import type { RegistryItem } from "@/lib/derive/registry";
import { blastRadius } from "@/lib/derive/blast";
import { estateLedger } from "@/lib/derive/ledger";
import { workflowUrlFromEnv, executionsUrlFromEnv } from "@/lib/n8n/links";
import type { AgentContext } from "./context";

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
