import "server-only";
import type { SopSuggestion } from "@/lib/derive/suggestions";
import { composeRegistryItem } from "@/lib/derive/registry";
import { systemEdges } from "@/lib/derive/edges";
import { factLine, synopsis, promptFacts, type ClusterFacts, type WorkflowProfile } from "@/lib/derive/clusterFacts";
import { getSuggestionReasons, setSuggestionReason } from "@/lib/backoffice/store";
import { openaiFromEnv } from "@/lib/agent/openai";
import { generateRationale } from "@/lib/agent/suggestion-reason";
import type { ChatClient } from "@/lib/agent/run";
import type { N8nWorkflow, N8nExecution } from "@/lib/n8n/types";
import type { Owner } from "@/lib/backoffice/types";

export interface EnrichInput {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  owners: Map<string, Owner>;
}

function facts(s: SopSuggestion, profiles: Map<string, WorkflowProfile>): ClusterFacts {
  const members = s.memberIds
    .map((id) => profiles.get(id))
    .filter((p): p is WorkflowProfile => !!p);
  return { members, basis: s.basis, targetSopName: s.targetSopName };
}

/**
 * Attach display + reasoning to each suggestion: workflow names, a deterministic
 * fact line, and a rationale. The rationale is cached per suggestion id (keyed by
 * the stable hash); if absent it's generated once via the LLM (off nothing —
 * callers run this off the render/sweep path) and cached. With no LLM key, it
 * falls back to a deterministic synopsis and does NOT cache, so enabling the key
 * later starts producing real rationales without a manual reset.
 */
export async function enrichSuggestions(
  suggestions: SopSuggestion[],
  input: EnrichInput,
): Promise<SopSuggestion[]> {
  if (suggestions.length === 0) return suggestions;

  const now = Date.now();
  const profiles = new Map<string, WorkflowProfile>();
  for (const w of input.workflows) {
    const item = composeRegistryItem(w, input.executions, input.owners.get(w.id) ?? null, now);
    // `systemEdges` reads node types directly, so it detects integrations the
    // registry's curated `systems` list can miss (e.g. YouTube, Google Drive).
    const systems = [...new Set(systemEdges(w).map((e) => e.system))];
    profiles.set(w.id, { id: item.id, name: item.name, trigger: item.trigger, systems });
  }

  const cached = await getSuggestionReasons();
  const client = openaiFromEnv();

  return Promise.all(
    suggestions.map(async (s) => {
      const f = facts(s, profiles);
      const memberNames = f.members.map((m) => m.name);
      const line = factLine(f);

      let rationale = cached.get(s.id);
      if (!rationale && client) {
        try {
          const gen = await generateRationale(promptFacts(f), client as ChatClient);
          if (gen) {
            rationale = gen;
            await setSuggestionReason(s.id, gen);
          }
        } catch {
          // fall through to the deterministic synopsis
        }
      }
      if (!rationale) rationale = synopsis(f);

      return { ...s, memberNames, factLine: line, rationale };
    }),
  );
}
