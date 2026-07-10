import type { AgentContext } from "./context";
import { toolSpecs, dispatch, type OpenAiToolSpec } from "./tools";

// Minimal shape of the OpenAI chat-completions client we depend on. The real
// `openai` SDK satisfies this; tests inject a stub.
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface ChatCompletion {
  choices: Array<{ message: ChatMessage }>;
}

export interface ChatClient {
  create(req: {
    model: string;
    messages: ChatMessage[];
    tools?: OpenAiToolSpec[];
    tool_choice?: "auto" | "none";
  }): Promise<ChatCompletion>;
}

export interface RunAgentInput {
  userText: string;
  context: AgentContext;
  client: ChatClient;
  /** Prior thread messages (Claude-tag context), oldest first. */
  history?: ChatMessage[];
  tools?: OpenAiToolSpec[];
  runTool?: (name: string, args: Record<string, unknown>, ctx: AgentContext) => unknown | Promise<unknown>;
  maxIters?: number;
  model?: string;
}

const PERSONA = `You are Otto, the n8n Backoffice coworker in Slack.
You help teams understand and operate their automation estate: what workflows exist and what they do, who owns them, and what breaks if one changes or fails.
Rules:
- Answer in plain business language, concise, Slack-friendly. No preamble.
- Whenever you discuss a specific workflow, surface its owner and (when relevant) its blast radius — who else is affected.
- Use the tools for any workflow fact. NEVER invent workflow names, owners, systems, or metrics; if a tool has no answer, say so plainly.
- You are answering inside a Slack thread; the prior messages are that thread's context.`;

function estateSummary(ctx: AgentContext): string {
  const total = ctx.items.length;
  const active = ctx.items.filter((i) => i.active).length;
  const highRisk = ctx.items.filter((i) => i.risk.level === "high").map((i) => i.name);
  const unowned = ctx.items.filter((i) => i.active && !i.owner).length;
  return [
    `Estate snapshot: ${total} workflows (${active} active), ${unowned} active without an owner.`,
    highRisk.length ? `High-risk: ${highRisk.slice(0, 8).join(", ")}.` : "No high-risk workflows right now.",
    ctx.live ? "(reading a live n8n instance)" : "(reading demo data)",
  ].join(" ");
}

export async function runAgent(input: RunAgentInput): Promise<{ text: string }> {
  const {
    userText,
    context,
    client,
    history = [],
    tools = toolSpecs,
    runTool = dispatch,
    maxIters = 6,
    // `||` (not `??`) so an empty-string env var falls through to the default.
    model = process.env.OTTO_MODEL || process.env.OPENAI_MODEL || "gpt-4.1",
  } = input;

  const messages: ChatMessage[] = [
    { role: "system", content: `${PERSONA}\n\n${estateSummary(context)}` },
    ...history,
    { role: "user", content: userText },
  ];

  for (let i = 0; i < maxIters; i++) {
    const res = await client.create({ model, messages, tools, tool_choice: "auto" });
    const msg = res.choices[0]?.message;
    if (!msg) break;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let result: unknown;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await runTool(call.function.name, args, context);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    return { text: msg.content ?? "" };
  }

  return { text: "I couldn't finish working that out — try asking a narrower question." };
}
