import { describe, it, expect } from "vitest";
import {
  buildUserPrompt,
  parseSuggestions,
  heuristicSuggestions,
  suggestOwnerChannels,
  type SuggestInput,
} from "@/lib/ai/suggestOwnerChannels";
import type { SlackChannel } from "@/components/ui/SlackChannelPicker";

const channels: SlackChannel[] = [
  { id: "C_FIN", name: "team-finance", isMember: true },
  { id: "C_SUP", name: "team-customer-support", isMember: false },
  { id: "C_PPL", name: "team-people-ops", isMember: true },
];

const refund: SuggestInput = {
  id: "wf_refund",
  name: "Refund Review Agent",
  systems: ["Stripe", "Gmail"],
  tags: ["support"],
  project: "Support Ops",
  team: "Support Ops",
  hasAgent: true,
};
const invoice: SuggestInput = {
  id: "wf_invoice",
  name: "Invoice Reminder",
  systems: ["Postgres"],
  tags: [],
  project: null,
  team: "Finance",
  hasAgent: false,
};

describe("buildUserPrompt", () => {
  it("lists channels and workflow facts the model needs", () => {
    const prompt = buildUserPrompt([refund], channels);
    expect(prompt).toContain("#team-finance");
    expect(prompt).toContain("#team-customer-support");
    expect(prompt).toContain("wf_refund");
    expect(prompt).toContain("Stripe/Gmail");
    expect(prompt).toContain('team-hint="Support Ops"');
  });
});

describe("parseSuggestions", () => {
  const ids = new Set(["wf_refund", "wf_invoice"]);

  it("maps a valid channel name to its id + membership", () => {
    const json = JSON.stringify({
      suggestions: [{ workflowId: "wf_refund", channel: "team-customer-support", confidence: "high", reasoning: "customer refunds" }],
    });
    const map = parseSuggestions(json, channels, ids);
    expect(map.get("wf_refund")).toEqual({
      channelId: "C_SUP",
      channelName: "team-customer-support",
      isMember: false,
      confidence: "high",
      reasoning: "customer refunds",
    });
  });

  it("tolerates a leading # on the channel name", () => {
    const json = JSON.stringify({ suggestions: [{ workflowId: "wf_invoice", channel: "#team-finance" }] });
    expect(parseSuggestions(json, channels, ids).get("wf_invoice")?.channelId).toBe("C_FIN");
  });

  it("drops only hallucinated channels and unknown workflows", () => {
    const json = JSON.stringify({
      suggestions: [
        { workflowId: "wf_refund", channel: "does-not-exist" }, // channel not in live list
        { workflowId: "ghost", channel: "team-finance" }, // not an unowned workflow
      ],
    });
    expect(parseSuggestions(json, channels, ids).size).toBe(0);
  });

  it("keeps a weak-but-real match, tagged low confidence", () => {
    const json = JSON.stringify({
      suggestions: [{ workflowId: "wf_invoice", channel: "team-finance", confidence: "low" }],
    });
    const map = parseSuggestions(json, channels, ids);
    expect(map.get("wf_invoice")?.confidence).toBe("low");
    expect(map.get("wf_invoice")?.channelId).toBe("C_FIN");
  });

  it("returns empty on malformed JSON instead of throwing", () => {
    expect(parseSuggestions("not json", channels, ids).size).toBe(0);
  });
});

describe("heuristicSuggestions (no-LLM fallback)", () => {
  it("matches team keywords to channel names by substring", () => {
    const map = heuristicSuggestions([refund, invoice], channels);
    expect(map.get("wf_refund")?.channelName).toBe("team-customer-support");
    expect(map.get("wf_invoice")?.channelName).toBe("team-finance");
  });

  it("omits a workflow when no channel name matches", () => {
    const orphan: SuggestInput = { id: "x", name: "X", systems: [], tags: [], project: null, team: "Legal" };
    expect(heuristicSuggestions([orphan as SuggestInput], channels).size).toBe(0);
  });
});

describe("suggestOwnerChannels (orchestrator)", () => {
  it("returns empty when there are no channels or no unowned workflows", async () => {
    expect((await suggestOwnerChannels([refund], [], { noCache: true })).size).toBe(0);
    expect((await suggestOwnerChannels([], channels, { noCache: true })).size).toBe(0);
  });

  it("uses the injected completer and parses its output", async () => {
    const complete = async () =>
      JSON.stringify({ suggestions: [{ workflowId: "wf_refund", channel: "team-customer-support", confidence: "high" }] });
    const map = await suggestOwnerChannels([refund], channels, { complete });
    expect(map.get("wf_refund")?.channelId).toBe("C_SUP");
  });

  it("falls back to the heuristic when the completer throws", async () => {
    const complete = async () => {
      throw new Error("LLM down");
    };
    const map = await suggestOwnerChannels([invoice], channels, { complete });
    expect(map.get("wf_invoice")?.channelName).toBe("team-finance");
  });
});
