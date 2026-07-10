import type { N8nWorkflow } from "@/lib/n8n/types";

// Archived workflows are excluded from the whole dashboard (registry, map,
// brief, Otto). Applied once at the client so every consumer is consistent.
export function excludeArchived(workflows: N8nWorkflow[]): N8nWorkflow[] {
  return workflows.filter((w) => !w.isArchived);
}
