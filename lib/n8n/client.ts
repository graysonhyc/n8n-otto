import "server-only";
import type {
  N8nExecution,
  N8nWorkflow,
} from "@/lib/n8n/types";
import { excludeArchived } from "./filter";

// Thin client over the n8n public REST API (/api/v1). Read-only.
// Auth via `X-N8N-API-KEY`. Handles cursor pagination.

export interface N8nClient {
  listWorkflows(): Promise<N8nWorkflow[]>;
  getWorkflow(id: string): Promise<N8nWorkflow>;
  listExecutions(limit?: number): Promise<N8nExecution[]>;
}

interface Paged<T> {
  data: T[];
  nextCursor?: string | null;
}

export function createN8nClient(baseUrl: string, apiKey: string): N8nClient {
  const root = `${baseUrl.replace(/\/$/, "")}/api/v1`;

  async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${root}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { "X-N8N-API-KEY": apiKey, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`n8n API ${path} → ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async function getAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await get<Paged<T>>(path, {
        ...params,
        limit: "100",
        ...(cursor ? { cursor } : {}),
      });
      out.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return out;
  }

  return {
    listWorkflows: async () => excludeArchived(await getAll<N8nWorkflow>("/workflows")),
    getWorkflow: (id: string) => get<N8nWorkflow>(`/workflows/${id}`),
    listExecutions: (limit = 250) =>
      getAll<N8nExecution>("/executions", { limit: String(limit) }),
  };
}

/** Build a client from environment; returns null if not configured. */
export function n8nFromEnv(): N8nClient | null {
  const baseUrl = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return createN8nClient(baseUrl, apiKey);
}
