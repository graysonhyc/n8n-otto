/**
 * Talk to Otto from the terminal — the whole agent brain (tools over your live
 * n8n + store, real OpenAI), no Slack required. Great for testing every feature.
 *
 * Usage:
 *   set -a; . ./.env; set +a          # load env once
 *   pnpm tsx scripts/ask-otto.ts "what touches Stripe?"
 *   pnpm tsx scripts/ask-otto.ts "what's our estate worth?"
 *   pnpm tsx scripts/ask-otto.ts "what breaks if the Refund Agent goes down?"
 *   pnpm tsx scripts/ask-otto.ts "how's our ownership coverage?"
 *   pnpm tsx scripts/ask-otto.ts "is the refund process healthy?"
 */
import { createN8nClient } from "@/lib/n8n/client";
import { getAllOwners, getAllLinks, getProcessGroupNames } from "@/lib/backoffice/store";
import { composeAgentContext, type AgentContext } from "@/lib/agent/context";
import { allWorkflows, executions as demoExecutions } from "@/lib/demo/fixtures";
import { agentToolset } from "@/lib/agent/actions";
import { openaiFromEnv } from "@/lib/agent/openai";
import { linearFromEnv } from "@/lib/linear/client";
import { runAgent, type ChatClient } from "@/lib/agent/run";

// Assemble the agent context directly (n8n client + store), bypassing the
// Next-runtime unstable_cache that buildAgentContext relies on.
async function loadContext(): Promise<AgentContext> {
  const [owners, links, groupNames] = await Promise.all([
    getAllOwners(),
    getAllLinks(),
    getProcessGroupNames(),
  ]);
  const baseUrl = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;
  if (baseUrl && apiKey) {
    const client = createN8nClient(baseUrl, apiKey);
    const [workflows, executions] = await Promise.all([client.listWorkflows(), client.listExecutions()]);
    return composeAgentContext({ workflows, executions, owners, links, groupNames, now: Date.now(), live: true });
  }
  return composeAgentContext({
    workflows: allWorkflows,
    executions: demoExecutions,
    owners,
    links,
    groupNames,
    now: Date.now(),
    live: false,
  });
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim() || "give me an overview of the estate";

  const openai = openaiFromEnv();
  if (!openai) {
    console.error("✗ Set OPENAI_API_KEY (and source .env) first.");
    process.exit(1);
  }

  // Log every tool Otto calls, so you can see it reasoning over the estate.
  const base = agentToolset(linearFromEnv());
  const runTool: typeof base.runTool = async (name, args, ctx) => {
    console.log(`  ↳ tool: ${name}(${JSON.stringify(args)})`);
    return base.runTool(name, args, ctx);
  };

  const ctx = await loadContext();
  console.log(`\n(${ctx.live ? "live n8n instance" : "demo data"} — ${ctx.items.length} workflows)\n`);
  console.log(`🙋 You: ${question}\n`);

  const { text } = await runAgent({
    userText: question,
    context: ctx,
    client: openai as ChatClient,
    tools: base.tools,
    runTool,
  });

  console.log(`\n🤖 Otto:\n${text}\n`);
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
