import "server-only";
import OpenAI from "openai";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { purposeDoc } from "@/lib/derive/similarity";
import { getEmbeddings, upsertEmbedding } from "@/lib/backoffice/store";

const MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";

/** Stable cache key for a workflow: its n8n versionId, else a hash of the doc. */
function versionKey(wf: N8nWorkflow, doc: string): string {
  const v = (wf as { versionId?: unknown }).versionId;
  if (typeof v === "string" && v.length > 0) return v;
  // djb2 hash of the purpose doc — changes only when the doc changes.
  let h = 5381;
  for (let i = 0; i < doc.length; i++) h = ((h << 5) + h + doc.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

/**
 * Embedding vector per workflow, reading the cache and only calling OpenAI for
 * workflows whose purpose document changed (by versionId/hash). Persists new
 * vectors. Returns whatever it can — with no API key, only already-cached
 * vectors come back (so the feature degrades to "nothing new" rather than error).
 */
export async function embedWorkflows(workflows: N8nWorkflow[]): Promise<Map<string, number[]>> {
  const stored = await getEmbeddings();
  const out = new Map<string, number[]>();
  const pending: { id: string; doc: string; version: string }[] = [];

  for (const wf of workflows) {
    const doc = purposeDoc(wf);
    const version = versionKey(wf, doc);
    const prev = stored.get(wf.id);
    if (prev && prev.versionId === version && prev.model === MODEL) {
      out.set(wf.id, prev.vector);
    } else {
      pending.push({ id: wf.id, doc, version });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (pending.length && apiKey) {
    const client = new OpenAI({ apiKey });
    const resp = await client.embeddings.create({ model: MODEL, input: pending.map((p) => p.doc) });
    for (let i = 0; i < pending.length; i++) {
      const vector = resp.data[i].embedding as number[];
      out.set(pending[i].id, vector);
      await upsertEmbedding({ workflowId: pending[i].id, versionId: pending[i].version, model: MODEL, vector });
    }
  }

  return out;
}
