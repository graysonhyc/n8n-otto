import type { AgentContext } from "./context";
import type { OpenAiToolSpec } from "./tools";
import { toolSpecs, dispatch } from "./tools";
import { blastRadius } from "@/lib/derive/blast";
import { buildTicket } from "@/lib/linear/ticket";
import type { LinearGateway } from "@/lib/linear/client";

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
];

function buildActionRunner(linear: LinearGateway | null): ToolRunner {
  return async (name, args, ctx) => {
    if (name !== "create_linear_ticket") throw new Error(`Unknown action tool: ${name}`);
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

// Compose read tools + action tools into one toolset for the agent loop.
export function agentToolset(linear: LinearGateway | null): { tools: OpenAiToolSpec[]; runTool: ToolRunner } {
  const runAction = buildActionRunner(linear);
  const actionNames = new Set(ACTION_SPECS.map((s) => s.function.name));
  const runTool: ToolRunner = (name, args, ctx) =>
    actionNames.has(name) ? runAction(name, args, ctx) : dispatch(name, args, ctx);
  return { tools: [...toolSpecs, ...ACTION_SPECS], runTool };
}
