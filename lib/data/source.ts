import "server-only";
import { n8nFromEnv } from "@/lib/n8n/client";
import { allWorkflows, executions as demoExecutions } from "@/lib/demo/fixtures";
import type { N8nExecution, N8nWorkflow } from "@/lib/n8n/types";

export interface Instance {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  live: boolean; // true when reading a real n8n instance, false when using demo fixtures
}

// Reads the configured n8n instance, or falls back to the demo fixtures so the
// app renders end-to-end before real credentials are wired.
export async function loadInstance(): Promise<Instance> {
  const client = n8nFromEnv();
  if (!client) {
    return { workflows: allWorkflows, executions: demoExecutions, live: false };
  }
  const [workflows, executions] = await Promise.all([
    client.listWorkflows(),
    client.listExecutions(),
  ]);
  return { workflows, executions, live: true };
}
