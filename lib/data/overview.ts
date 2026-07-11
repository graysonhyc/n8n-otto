import "server-only";
import { loadInstance } from "./source";
import { loadBrief } from "./brief";
import { getAllOwners } from "@/lib/backoffice/store";
import { composeRegistry } from "@/lib/derive/registry";
import { buildOverview, type Overview } from "@/lib/derive/overview";
import type { BriefItem } from "@/lib/brief/build";

export interface OverviewView {
  overview: Overview;
  brief: BriefItem[];
  live: boolean;
}

// Assembles the Overview dashboard. Composes the registry directly (rather than
// via loadRegistry) to skip the LLM owner-channel suggestion pass — the overview
// only needs aggregate counts, not per-row suggestions. loadInstance is cached,
// so the parallel loadBrief call reuses the same n8n fetch.
export async function loadOverview(): Promise<OverviewView> {
  const now = Date.now();
  const [{ workflows, executions, live }, owners, brief] = await Promise.all([
    loadInstance(),
    getAllOwners(),
    loadBrief(),
  ]);
  const items = composeRegistry({ workflows, executions, owners, now });
  const overview = buildOverview({
    items,
    executions,
    briefCount: brief.items.length,
    now,
  });
  return { overview, brief: brief.items, live };
}
