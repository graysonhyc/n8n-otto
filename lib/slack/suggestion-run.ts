import "server-only";
import { getAllOwners, getSlackInstall, getSuggestionStates, listSops, setSuggestionState } from "@/lib/backoffice/store";
import { loadInstance } from "@/lib/data/source";
import { buildClusters, classifySuggestions } from "@/lib/derive/suggestions";
import { enrichSuggestions } from "@/lib/data/suggestions";
import { masterChannelId, postBlocks } from "@/lib/slack/post";
import { suggestionBlocks } from "@/lib/slack/blocks";
import type { Owner } from "@/lib/backoffice/types";

export type SuggestionSweepResult =
  | { ok: false; status: number; error: string }
  | { ok: true; posted: number };

/**
 * Resolve where a suggestion should be posted: if every member workflow resolves
 * to the same owner Slack channel, use it; otherwise fall back to the dedicated
 * suggestions channel (SLACK_SUGGESTIONS_CHANNEL), then the catch-all master
 * channel. Returns null only when none is available — the suggestion is then
 * skipped rather than posted to the wrong place.
 */
function resolveChannel(memberIds: string[], owners: Map<string, Owner>): string | null {
  const channels = new Set<string>();
  for (const id of memberIds) {
    const ch = owners.get(id)?.slackChannelId;
    if (ch) channels.add(ch);
  }
  if (channels.size === 1) return [...channels][0];
  return process.env.SLACK_SUGGESTIONS_CHANNEL ?? masterChannelId() ?? null;
}

/**
 * Post every SOP suggestion that is currently in the list — i.e. still detected
 * and not explicitly dismissed — on each (daily) run. This matches the /map
 * suggestions view exactly: only a Dismiss suppresses a suggestion; a prior
 * notify does NOT, so a still-relevant SOP is re-surfaced to Slack every day
 * until the team acts on it (creates the SOP or dismisses it).
 */
export async function runSuggestionSweep(): Promise<SuggestionSweepResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const [{ workflows, executions }, sops, owners, states] = await Promise.all([
    loadInstance(),
    listSops(),
    getAllOwners(),
    getSuggestionStates(),
  ]);

  const sopByWorkflow = new Map<string, { id: string; name: string }>();
  for (const s of sops) for (const m of s.members) sopByWorkflow.set(m.workflowId, { id: s.id, name: s.name });
  const names = new Map(workflows.map((w) => [w.id, w.name]));

  // Only an explicit Dismiss suppresses a suggestion (same rule the /map view
  // uses). A prior notify does not — so current suggestions are re-sent daily.
  const dismissed = new Set([...states].filter(([, status]) => status === "dismissed").map(([id]) => id));
  const raw = classifySuggestions({ clusters: buildClusters(workflows), sopByWorkflow, dismissed });
  const fresh = await enrichSuggestions(raw, { workflows, executions, owners });

  let posted = 0;
  for (const s of fresh) {
    const channel = resolveChannel(s.memberIds, owners);
    if (!channel) continue;
    await postBlocks(install.botToken, channel, suggestionBlocks(s, names), s.reason);
    await setSuggestionState(s.id, "notified");
    posted++;
  }
  return { ok: true, posted };
}
