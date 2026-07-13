import "server-only";
import { unstable_cache } from "next/cache";
import { n8nFromEnv } from "@/lib/n8n/client";
import { allWorkflows, executions as demoExecutions } from "@/lib/demo/fixtures";
import { demoExecutionOverlay } from "@/lib/demo/executions";
import type { N8nExecution, N8nWorkflow } from "@/lib/n8n/types";

export interface Instance {
  workflows: N8nWorkflow[]; // live (archived excluded) — what the registry/map/brief operate on
  archived: N8nWorkflow[]; // archived workflows, kept only for counts (e.g. per-team brief stats)
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
    const [{ active, archived }, executions] = await Promise.all([
      client.listWorkflowsWithArchived(),
      client.listExecutions(),
    ]);
    return { workflows: active, archived, executions, live: true };
  },
  ["n8n-instance"],
  { revalidate: INSTANCE_TTL_SECONDS, tags: [INSTANCE_CACHE_TAG] },
);

// Reads the configured n8n instance, or falls back to the demo fixtures so the
// app renders end-to-end before real credentials are wired. When DEMO_EXECUTIONS
// is set, a synthetic ~10-day execution history is overlaid onto the live
// workflows so the brief/errors/ROI surfaces have meaningful data for a demo
// (the instance itself is barely exercised). See lib/demo/executions.ts.
export async function loadInstance(): Promise<Instance> {
  if (!n8nFromEnv()) {
    return {
      workflows: allWorkflows.filter((w) => !w.isArchived),
      archived: allWorkflows.filter((w) => w.isArchived),
      executions: demoExecutions,
      live: false,
    };
  }
  const instance = await fetchLiveInstance();
  if (process.env.DEMO_EXECUTIONS === "1") {
    return {
      ...instance,
      executions: [...instance.executions, ...demoExecutionOverlay(instance.workflows, Date.now())],
    };
  }
  return instance;
}
