import "server-only";
import { unstable_cache } from "next/cache";
import { n8nFromEnv } from "@/lib/n8n/client";
import { allWorkflows, executions as demoExecutions } from "@/lib/demo/fixtures";
import type { N8nExecution, N8nWorkflow } from "@/lib/n8n/types";

export interface Instance {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  live: boolean; // true when reading a real n8n instance, false when using demo fixtures
}

// Time-based cache for the live n8n fetch. Every backoffice route is
// force-dynamic and pulls the instance independently, so without this each tab
// switch re-hits n8n twice (workflows + executions). n8n data is monitoring
// output, not user-edited in-app, so a short window is safe and makes rapid
// navigation reuse one fetch. Owner/link edits live in Postgres (read live),
// so they are never staled by this. Revalidate via `INSTANCE_CACHE_TAG` after
// any action that should force a fresh pull.
export const INSTANCE_CACHE_TAG = "n8n-instance";
const INSTANCE_TTL_SECONDS = 20;

const fetchLiveInstance = unstable_cache(
  async (): Promise<Instance> => {
    const client = n8nFromEnv()!;
    const [workflows, executions] = await Promise.all([
      client.listWorkflows(),
      client.listExecutions(),
    ]);
    return { workflows, executions, live: true };
  },
  ["n8n-instance"],
  { revalidate: INSTANCE_TTL_SECONDS, tags: [INSTANCE_CACHE_TAG] },
);

// Reads the configured n8n instance, or falls back to the demo fixtures so the
// app renders end-to-end before real credentials are wired.
export async function loadInstance(): Promise<Instance> {
  if (!n8nFromEnv()) {
    return { workflows: allWorkflows, executions: demoExecutions, live: false };
  }
  return fetchLiveInstance();
}
