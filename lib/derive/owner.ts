import type { N8nWorkflow } from "@/lib/n8n/types";

// Confidence-gated owner-team *suggestion*. This never assigns an owner — it only
// proposes one for a human to apply. When no signal is strong enough, it returns
// null and the owner stays empty (the "if unsure, leave it empty" rule).

export type OwnerConfidence = "high" | "medium";

export interface OwnerSuggestion {
  team: string;
  confidence: OwnerConfidence;
  reasoning: string;
}

// Tag name (lowercased) → owning team. This is the one bit of business knowledge
// worth curating; extend it as teams and tag conventions change.
const TEAM_BY_TAG: Record<string, string> = {
  support: "Support Ops",
  "support-ops": "Support Ops",
  revops: "RevOps",
  sales: "Sales Ops",
  "sales-ops": "Sales Ops",
  hr: "People Ops",
  "people-ops": "People Ops",
  finance: "Finance",
};

export function suggestOwner(workflow: N8nWorkflow): OwnerSuggestion | null {
  // Strongest signal: the n8n project a workflow lives in already names its team.
  const project = workflow.homeProject?.name?.trim();
  if (project) {
    return {
      team: project,
      confidence: "high",
      reasoning: `Lives in the “${project}” n8n project.`,
    };
  }

  // Next best: an explicit team tag.
  for (const tag of workflow.tags ?? []) {
    const team = TEAM_BY_TAG[tag.name.trim().toLowerCase()];
    if (team) {
      return { team, confidence: "medium", reasoning: `Tagged “${tag.name}”.` };
    }
  }

  // Deliberately NOT inferred from connected systems: a system like Stripe is
  // ambiguous (Finance vs RevOps vs Support), and guessing there is exactly what
  // produced wrong "Finance" owners. Unsure → no suggestion, owner stays empty.
  return null;
}
