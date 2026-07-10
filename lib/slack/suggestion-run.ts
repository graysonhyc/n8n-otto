import "server-only";
import { getAllOwners, getSlackInstall, getSuggestionStates, listSops, setSuggestionState } from "@/lib/backoffice/store";
import { loadInstance } from "@/lib/data/source";
import { buildClusters, classifySuggestions } from "@/lib/derive/suggestions";
import { enrichSuggestions } from "@/lib/data/suggestions";
import { postBlocks } from "@/lib/slack/post";
import { suggestionBlocks } from "@/lib/slack/blocks";
import type { Owner } from "@/lib/backoffice/types";

export type SuggestionSweepResult =
  | { ok: false; status: number; error: string }
  | { ok: true; posted: number };

/**
 * Resolve where a suggestion should be posted: if every member workflow resolves
 * to the same owner Slack channel, use it; otherwise fall back to the ops channel
 * (SLACK_SUGGESTIONS_CHANNEL). Returns null when neither is available — the
 * suggestion is then skipped rather than posted to the wrong place.
 */
function resolveChannel(memberIds: string[], owners: Map<string, Owner>): string | null {
  const channels = new Set<string>();
  for (const id of memberIds) {
    const ch = owners.get(id)?.slackChannelId;
    if (ch) channels.add(ch);
  }
  if (channels.size === 1) return [...channels][0];
  return process.env.SLACK_SUGGESTIONS_CHANNEL ?? null;
}

/**
 * Post any not-yet-acted-on SOP suggestion to Slack, then mark it `notified` so
 * the next sweep does not repost it. Dismissed and already-notified suggestions
 * are skipped (both carry a state row).
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

  // Any suggestion with a state row (dismissed OR notified) is already handled.
  const acted = new Set(states.keys());
  const raw = classifySuggestions({ clusters: buildClusters(workflows), sopByWorkflow, dismissed: acted });
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
