import { describe, expect, it } from "vitest";
import { suggestionBlocks } from "@/lib/slack/blocks";
import type { SopSuggestion } from "@/lib/derive/suggestions";

const newSop: SopSuggestion = {
  id: "abc123",
  kind: "new-sop",
  confidence: "strong",
  memberIds: ["a", "b", "c"],
  reason: "3 workflows call each other",
  targetSopId: null,
  targetSopName: null,
  basis: { viaCalls: true, sharedResource: null },
};

const addToSop: SopSuggestion = {
  id: "def456",
  kind: "add-to-sop",
  confidence: "possible",
  memberIds: ["d"],
  reason: "share Postgres: orders",
  targetSopId: "s1",
  targetSopName: "Refunds",
  basis: { viaCalls: false, sharedResource: { system: "Postgres", name: "orders" } },
};

// Pull the action elements out of the blocks for assertions.
function actions(blocks: ReturnType<typeof suggestionBlocks>) {
  const block = blocks.find((b) => b.type === "actions") as
    | { type: "actions"; elements: Array<{ action_id: string; value: string }> }
    | undefined;
  return block?.elements ?? [];
}

describe("suggestionBlocks", () => {
  it("new-sop uses create_sop_from_suggestion + dismiss", () => {
    const els = actions(suggestionBlocks(newSop));
    expect(els.map((e) => e.action_id)).toEqual(["create_sop_from_suggestion", "dismiss_suggestion"]);
  });

  it("add-to-sop uses add_to_sop_suggestion + dismiss", () => {
    const els = actions(suggestionBlocks(addToSop));
    expect(els.map((e) => e.action_id)).toEqual(["add_to_sop_suggestion", "dismiss_suggestion"]);
  });

  it("encodes a round-trippable value with a JSON-string memberIds field", () => {
    const els = actions(suggestionBlocks(newSop));
    const value = JSON.parse(els[0].value) as Record<string, string>;
    expect(value.suggestionId).toBe("abc123");
    expect(value.kind).toBe("new-sop");
    expect(JSON.parse(value.memberIds)).toEqual(["a", "b", "c"]);
  });

  it("renders workflow names when a name map is supplied", () => {
    const blocks = suggestionBlocks(newSop, new Map([["a", "Alpha"], ["b", "Beta"]]));
    const ctx = blocks.find((b) => b.type === "context") as { elements: Array<{ text: string }> };
    expect(ctx.elements[0].text).toContain("Alpha");
    expect(ctx.elements[0].text).toContain("Beta");
  });
});
