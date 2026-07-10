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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function linearFromEnv(): LinearGateway | null {
  const apiKey = process.env.LINEAR_API_KEY;
  const rawTeam = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !rawTeam) return null;

  const client = new LinearClient({ apiKey });
  let resolvedTeamId: string | null = null;

  // Accept either a team UUID or a team key (e.g. "GRA"). The issueCreate
  // mutation needs the UUID, so resolve+cache the key on first use.
  async function teamId(): Promise<string> {
    if (resolvedTeamId) return resolvedTeamId;
    if (UUID_RE.test(rawTeam!)) return (resolvedTeamId = rawTeam!);
    const teams = await client.teams({ filter: { key: { eq: rawTeam! } } });
    const team = teams.nodes[0];
    if (!team) {
      throw new Error(`No Linear team with key "${rawTeam}" — set LINEAR_TEAM_ID to a team key or UUID.`);
    }
    return (resolvedTeamId = team.id);
  }

  return {
    async createIssue({ title, description }) {
      const payload = await client.createIssue({ teamId: await teamId(), title, description });
      const issue = await payload.issue;
      if (!issue) throw new Error("Linear did not return the created issue");
      return { id: issue.id, url: issue.url, identifier: issue.identifier };
    },
  };
}
