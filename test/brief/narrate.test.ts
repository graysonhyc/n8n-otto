import { describe, expect, it, vi } from "vitest";
import { narrateBrief } from "@/lib/brief/narrate";
import type { ChatClient } from "@/lib/agent/run";
import { computeDailyBrief } from "@/lib/brief/daily";
import { composeRegistry } from "@/lib/derive/registry";
import { allWorkflows, executions } from "@/lib/demo/fixtures";

const NOW = Date.parse("2026-07-10T09:00:00+02:00");
const items = composeRegistry({ workflows: allWorkflows, executions, owners: new Map(), now: NOW });
const daily = computeDailyBrief({
  items,
  executions,
  changes: new Map(),
  attention: [],
  sharedCredentials: [],
  now: NOW,
});

function reply(content: string) {
  return { choices: [{ message: { role: "assistant" as const, content } }] };
}

describe("narrateBrief", () => {
  it("returns the model's prose and feeds exact figures in the prompt", async () => {
    const create = vi.fn().mockResolvedValueOnce(reply("Yesterday was steady. 88 runs, 6 errors."));
    const client: ChatClient = { create };

    const text = await narrateBrief({ daily, channelName: "#growth", client });

    expect(text).toContain("88 runs");
    const sent = create.mock.calls[0][0];
    const payload = JSON.stringify(sent.messages);
    // exact yesterday figures must be present in the DATA we send
    expect(payload).toContain(String(daily.yesterday.runs));
    // must forbid inventing numbers
    expect(payload.toLowerCase()).toContain("never invent");
    // single completion, no tools
    expect(sent.tools).toBeUndefined();
  });

  it("falls back to a deterministic line when the model returns nothing", async () => {
    const create = vi.fn().mockResolvedValueOnce(reply(""));
    const client: ChatClient = { create };
    const text = await narrateBrief({ daily, channelName: "#growth", client });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(String(daily.yesterday.runs));
  });
});
