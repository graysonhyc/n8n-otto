// n8n editor deep-links. NOTE: the n8n public REST API has no execution-retry
// endpoint (retry is UI-only), so "replay" remediation is a deep-link to the
// workflow's executions where a human clicks retry — safe and always works.

function base(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/$/, "");
}

export function workflowUrl(baseUrl: string | null | undefined, id: string): string | null {
  const b = base(baseUrl);
  return b ? `${b}/workflow/${id}` : null;
}

export function executionsUrl(baseUrl: string | null | undefined, id: string): string | null {
  const b = base(baseUrl);
  return b ? `${b}/workflow/${id}/executions` : null;
}

/** Convenience from env (server-side). */
export function workflowUrlFromEnv(id: string): string | null {
  return workflowUrl(process.env.N8N_BASE_URL, id);
}

export function executionsUrlFromEnv(id: string): string | null {
  return executionsUrl(process.env.N8N_BASE_URL, id);
}
