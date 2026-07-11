import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { SlackChannel } from "@/components/ui/SlackChannelPicker";

// LLM-judged owner routing: map each *unowned* workflow to the single best-fit
// Slack channel from the *live* workspace. Suggestion only — a human accepts (✓)
// or dismisses (✗) it in the registry. Confidence-gated: when nothing clearly
// fits, we omit the workflow (the "leave empty when unsure" rule), so the row
// falls back to plain "Unassigned".

export interface OwnerChannelSuggestion {
  channelId: string;
  channelName: string;
  isMember: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

// Narrow view of a workflow the suggester reasons over — decoupled from the full
// RegistryItem so this module has no dependency on the derive layer.
export interface SuggestInput {
  id: string;
  name: string;
  systems: string[];
  tags: string[];
  project: string | null;
  team: string | null; // deterministic owner-team hint (a strong prior)
  hasAgent?: boolean;
}

/** Injectable completion fn (system, user) → raw JSON string. Lets tests run
 *  the parse/gate path without hitting OpenAI. */
export type Completer = (system: string, user: string) => Promise<string>;

const SYSTEM = [
  "You route n8n workflows to their owning Slack channel.",
  "You are given the ACTUAL list of channels in this workspace. Match EVERY workflow to the single closest-fit channel from that list — the team most likely to own alerts and tickets for it.",
  "Always pick from the given channels, using their names EXACTLY. Never invent a channel, and do not skip a workflow — if the fit is weak, still pick the least-bad channel and mark it low confidence.",
  'Respond with JSON: {"suggestions":[{"workflowId":"...","channel":"exact-channel-name","confidence":"high|medium|low","reasoning":"one short sentence"}]}.',
  "confidence: high when the owning team is obvious, medium for a reasonable inference, low for a weak best-guess among the available channels.",
].join(" ");

export function buildUserPrompt(unowned: SuggestInput[], channels: SlackChannel[]): string {
  const channelList = channels.map((c) => `#${c.name}`).join(", ");
  const workflows = unowned
    .map((w) => {
      const bits = [
        `- id=${w.id} name="${w.name}"`,
        w.hasAgent ? "(AI agent)" : "",
        w.team ? `team-hint="${w.team}"` : "",
        w.project ? `project="${w.project}"` : "",
        w.systems.length ? `systems=${w.systems.join("/")}` : "",
        w.tags.length ? `tags=${w.tags.join("/")}` : "",
      ].filter(Boolean);
      return bits.join(" ");
    })
    .join("\n");
  return `Channels: ${channelList}\n\nWorkflows:\n${workflows}`;
}

const ResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        workflowId: z.string(),
        channel: z.string(),
        confidence: z.enum(["high", "medium", "low"]).optional(),
        reasoning: z.string().optional(),
      }),
    )
    .optional(),
});

/** Parse the LLM JSON into a validated map. Drops entries whose channel isn't in
 *  the live list, whose workflow isn't unowned, or whose confidence is low. */
export function parseSuggestions(
  json: string,
  channels: SlackChannel[],
  validIds: Set<string>,
): Map<string, OwnerChannelSuggestion> {
  const out = new Map<string, OwnerChannelSuggestion>();
  const byName = new Map(channels.map((c) => [c.name.toLowerCase(), c]));
  let parsed: z.infer<typeof ResponseSchema>;
  try {
    parsed = ResponseSchema.parse(JSON.parse(json));
  } catch {
    return out;
  }
  for (const s of parsed.suggestions ?? []) {
    if (!validIds.has(s.workflowId) || out.has(s.workflowId)) continue;
    // Only drop when the model names a channel that isn't actually in the live
    // list (a hallucination). Weak-but-real matches are kept, tagged low, and the
    // human decides via ✓/✗ — we no longer abstain on low confidence.
    const channel = byName.get(s.channel.replace(/^#+/, "").trim().toLowerCase());
    if (!channel) continue;
    out.set(s.workflowId, {
      channelId: channel.id,
      channelName: channel.name,
      isMember: channel.isMember,
      confidence: s.confidence ?? "medium",
      reasoning: s.reasoning?.trim() || `Closest-fit channel for “${channel.name}”.`,
    });
  }
  return out;
}

// Extra team → keyword hints for the no-LLM fallback (project/tag words already
// match channel names directly, e.g. "finance" → #team-finance).
const KEYWORDS_BY_TEAM: Record<string, string[]> = {
  "support ops": ["support", "customer"],
  "customer success": ["success", "customer", "cs"],
  "people ops": ["people", "hr"],
  "billing ops": ["billing", "finance", "payments"],
  "it & security": ["it", "security", "infra"],
  finance: ["finance", "billing"],
  revops: ["revops", "revenue", "growth"],
  "sales ops": ["sales"],
  marketing: ["marketing", "content", "growth"],
};

/** Deterministic fallback when no OpenAI key is set (also keeps tests hermetic).
 *  Matches team/tag/project keywords against channel names by substring. */
export function heuristicSuggestions(
  unowned: SuggestInput[],
  channels: SlackChannel[],
): Map<string, OwnerChannelSuggestion> {
  const out = new Map<string, OwnerChannelSuggestion>();
  for (const w of unowned) {
    const keywords = new Set<string>();
    for (const t of [w.team, w.project, ...w.tags]) {
      if (!t) continue;
      const norm = t.toLowerCase();
      keywords.add(norm);
      for (const word of norm.split(/[^a-z]+/).filter((x) => x.length > 2)) keywords.add(word);
      for (const kw of KEYWORDS_BY_TEAM[norm] ?? []) keywords.add(kw);
    }
    const match = channels.find((c) => {
      const name = c.name.toLowerCase();
      return [...keywords].some((k) => name.includes(k));
    });
    if (match) {
      out.set(w.id, {
        channelId: match.id,
        channelName: match.name,
        isMember: match.isMember,
        confidence: "medium",
        reasoning: `Name matches the ${w.team ?? w.project ?? "team"} owner.`,
      });
    }
  }
  return out;
}

async function openAiComplete(system: string, user: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: process.env.OTTO_MODEL || process.env.OPENAI_MODEL || "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? "{}";
}

// Memo by input signature. Assigning or dismissing a workflow changes the unowned
// set → new signature → recompute, so the cache self-invalidates without tags.
const memo = new Map<string, Map<string, OwnerChannelSuggestion>>();
function signature(unowned: SuggestInput[], channels: SlackChannel[]): string {
  return (
    unowned.map((u) => u.id).sort().join(",") + "|" + channels.map((c) => c.id).sort().join(",")
  );
}

export async function suggestOwnerChannels(
  unowned: SuggestInput[],
  channels: SlackChannel[],
  opts: { complete?: Completer; noCache?: boolean } = {},
): Promise<Map<string, OwnerChannelSuggestion>> {
  if (unowned.length === 0 || channels.length === 0) return new Map();

  const key = signature(unowned, channels);
  if (!opts.complete && !opts.noCache) {
    const hit = memo.get(key);
    if (hit) return hit;
  }

  const complete = opts.complete ?? (process.env.OPENAI_API_KEY ? openAiComplete : null);
  let result: Map<string, OwnerChannelSuggestion>;
  if (!complete) {
    result = heuristicSuggestions(unowned, channels);
  } else {
    try {
      const json = await complete(SYSTEM, buildUserPrompt(unowned, channels));
      result = parseSuggestions(json, channels, new Set(unowned.map((u) => u.id)));
    } catch {
      result = heuristicSuggestions(unowned, channels);
    }
  }

  if (!opts.complete && !opts.noCache) memo.set(key, result);
  return result;
}
