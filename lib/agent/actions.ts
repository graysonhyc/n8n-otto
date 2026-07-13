import type { AgentContext } from "./context";
import type { OpenAiToolSpec } from "./tools";
import { toolSpecs, dispatch } from "./tools";
import { blastRadius } from "@/lib/derive/blast";
import { buildTicket } from "@/lib/linear/ticket";
import type { LinearGateway } from "@/lib/linear/client";
import { createSop as createSopStore } from "@/lib/backoffice/store";
import type { Sop } from "@/lib/backoffice/types";

// The store functions the action tools mutate through. Injected so unit tests
// can run the runner without a live database; the route uses the real store.
export interface ActionDeps {
  createSop: (name: string, memberIds: string[], description?: string | null) => Promise<Sop>;
}

// Action tools mutate the outside world, so they need injected clients and are
// async. The Linear ticket tool is confirm-gated: the first call returns a
// preview and instructs the model to get the user's OK in-thread; only a second
// call with confirm:true actually files. This stops the LLM from spamming.
export type ToolRunner = (
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
) => unknown | Promise<unknown>;

const ACTION_SPECS: OpenAiToolSpec[] = [
  {
    type: "function",
    function: {
      name: "create_linear_ticket",
      description:
        "File a Linear ticket for a workflow. Owner and blast radius are attached automatically. ALWAYS call this once WITHOUT confirm to show the user a preview, get their explicit OK in the thread, then call again with confirm:true to actually file.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "workflow id" },
          confirm: { type: "boolean", description: "true ONLY after the user approved the preview" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_sop_from_thread",
      description:
        "Create an SOP (a named, documented business process) from what was discussed in this Slack thread. First use search_workflows to resolve the workflows the thread mentions to their ids, then call this with a business-process name, a description synthesized from the discussion, and those ids as members. Reports back the created SOP so you can share it in the thread.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "the business-process name (not a tool name); e.g. 'Refund handling'",
          },
          description: {
            type: "string",
            description: "a short summary of the process, drawn from what the thread discussed",
          },
          memberIds: {
            type: "array",
            items: { type: "string" },
            description: "workflow ids to link into the SOP, resolved via search_workflows",
          },
        },
        required: ["name"],
      },
    },
  },
];

function runCreateLinearTicket(linear: LinearGateway | null): ToolRunner {
  return async (_name, args, ctx) => {
    const id = String(args.id ?? "");
    const item = ctx.items.find((i) => i.id === id);
    if (!item) return { error: `No workflow with id ${id}` };

    const draft = buildTicket({ item, blast: blastRadius(id, ctx.graph), changes: [] });

    if (!args.confirm) {
      return {
        preview: draft,
        note: "Show this to the user and ask them to confirm. Only call again with confirm:true after they say yes.",
      };
    }
    if (!linear) return { error: "Linear isn't configured (set LINEAR_API_KEY and LINEAR_TEAM_ID)." };

    const issue = await linear.createIssue(draft);
    return { filed: true, url: issue.url, identifier: issue.identifier };
  };
}

function runCreateSopFromThread(deps: ActionDeps): ToolRunner {
  return async (_name, args, ctx) => {
    const sopName = String(args.name ?? "").trim();
    if (!sopName) return { error: "An SOP needs a name — summarize the process in a few words first." };

    const description = args.description != null ? String(args.description).trim() || null : null;
    const requested = Array.isArray(args.memberIds) ? args.memberIds.map(String) : [];
    // The model resolves ids via search_workflows, but guard against a stray/
    // hallucinated id: keep the valid members and report what was dropped rather
    // than failing the whole create.
    const valid = requested.filter((id) => ctx.items.some((i) => i.id === id));
    const skippedUnknownIds = requested.filter((id) => !valid.includes(id));

    const sop = await deps.createSop(sopName, valid, description);
    const linkedWorkflows = valid.map((id) => ctx.items.find((i) => i.id === id)!.name);
    return { created: true, sopId: sop.id, name: sop.name, linkedWorkflows, skippedUnknownIds };
  };
}

// Compose read tools + action tools into one toolset for the agent loop.
export function agentToolset(
  linear: LinearGateway | null,
  deps: ActionDeps = { createSop: createSopStore },
): { tools: OpenAiToolSpec[]; runTool: ToolRunner } {
  const runners: Record<string, ToolRunner> = {
    create_linear_ticket: runCreateLinearTicket(linear),
    create_sop_from_thread: runCreateSopFromThread(deps),
  };
  const runTool: ToolRunner = (name, args, ctx) =>
    runners[name] ? runners[name](name, args, ctx) : dispatch(name, args, ctx);
  return { tools: [...toolSpecs, ...ACTION_SPECS], runTool };
}
