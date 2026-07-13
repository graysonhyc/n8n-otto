import type { N8nWorkflow } from "@/lib/n8n/types";
import { workflowIntegrations } from "./integrations";

// Pure semantic-similarity helpers (no network, no DB). Embeddings are produced
// elsewhere (lib/ai/embed.ts); this module only turns a workflow into the text we
// embed and compares the resulting vectors.

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SimilarPair {
  a: string; // workflow id
  b: string; // workflow id
  score: number; // cosine, 0..1
}

/**
 * Unordered workflow pairs whose embeddings are at least `threshold` similar,
 * highest score first, capped so no workflow appears in more than `k` kept pairs
 * (keeps the "possible duplicates" list focused instead of a clique dump).
 */
export function similarPairs(
  entries: { id: string; vector: number[] }[],
  threshold = 0.83,
  k = 3,
): SimilarPair[] {
  const scored: SimilarPair[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const score = cosine(entries[i].vector, entries[j].vector);
      if (score >= threshold) scored.push({ a: entries[i].id, b: entries[j].id, score });
    }
  }
  scored.sort((x, y) => y.score - x.score);

  const perWorkflow = new Map<string, number>();
  const kept: SimilarPair[] = [];
  for (const p of scored) {
    const ca = perWorkflow.get(p.a) ?? 0;
    const cb = perWorkflow.get(p.b) ?? 0;
    if (ca >= k || cb >= k) continue;
    kept.push(p);
    perWorkflow.set(p.a, ca + 1);
    perWorkflow.set(p.b, cb + 1);
  }
  return kept;
}

function nodeKind(type: string): string {
  return type.split(".").pop() ?? type;
}

/** Pull any human-authored intent text off a node (agent prompt / set text). */
function nodeText(params: Record<string, unknown> | undefined): string[] {
  if (!params) return [];
  const out: string[] = [];
  const opts = params.options;
  if (opts && typeof opts === "object" && "systemMessage" in opts) {
    const m = (opts as { systemMessage: unknown }).systemMessage;
    if (typeof m === "string") out.push(m);
  }
  if (typeof params.text === "string") out.push(params.text);
  return out;
}

/**
 * The text we embed to judge whether two workflows do the same job: name,
 * description, the services they touch, the kinds of nodes, and any agent prompts.
 * Deterministic so an unchanged workflow always yields the same document (and the
 * same cache key).
 */
export function purposeDoc(workflow: N8nWorkflow): string {
  const nodeTypes = [...new Set(workflow.nodes.map((n) => nodeKind(n.type)))].sort();
  const prompts = workflow.nodes.flatMap((n) => nodeText(n.parameters));
  const integrations = workflowIntegrations(workflow);
  return [
    workflow.name,
    workflow.description ?? "",
    integrations.join(" "),
    nodeTypes.join(" "),
    prompts.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}
