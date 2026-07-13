import "server-only";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { embedWorkflows } from "@/lib/ai/embed";
import { similarPairs, type SimilarPair } from "@/lib/derive/similarity";

const THRESHOLD = Number(process.env.SIMILAR_THRESHOLD ?? 0.83);
const TOP_K = Number(process.env.SIMILAR_TOP_K ?? 3);

/**
 * Semantic near-duplicate workflow pairs across the estate. Embeds (cached),
 * then cosine top-K above threshold. Returns [] when embeddings are unavailable
 * (no API key / nothing cached) — the feature degrades silently.
 */
export async function computeSimilarPairs(workflows: N8nWorkflow[]): Promise<SimilarPair[]> {
  // Semantic similarity is an advisory add-on. It must never break the core
  // relationships dashboard or Otto — a DB/OpenAI failure degrades to "no
  // duplicates", not a 500.
  try {
    const vectors = await embedWorkflows(workflows);
    const entries = workflows
      .filter((w) => vectors.has(w.id))
      .map((w) => ({ id: w.id, vector: vectors.get(w.id)! }));
    if (entries.length < 2) return [];
    return similarPairs(entries, THRESHOLD, TOP_K);
  } catch (err) {
    console.warn("[duplicates] semantic similarity unavailable:", (err as Error).message);
    return [];
  }
}
