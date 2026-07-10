import "server-only";
import { LinearClient } from "@linear/sdk";

export interface LinearIssue {
  id: string;
  url: string;
  identifier: string;
}

// Tiny gateway over the Linear SDK so the rest of the app depends on this
// interface, not the SDK surface. NOTE: this uses Linear's real API via
// LINEAR_API_KEY — it is NOT the Claude-session Linear MCP (which the deployed
// server cannot reach).
export interface LinearGateway {
  createIssue(input: { title: string; description: string }): Promise<LinearIssue>;
}

export function linearFromEnv(): LinearGateway | null {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) return null;

  const client = new LinearClient({ apiKey });
  return {
    async createIssue({ title, description }) {
      const payload = await client.createIssue({ teamId, title, description });
      const issue = await payload.issue;
      if (!issue) throw new Error("Linear did not return the created issue");
      return { id: issue.id, url: issue.url, identifier: issue.identifier };
    },
  };
}
