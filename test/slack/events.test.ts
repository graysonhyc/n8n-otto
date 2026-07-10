import { describe, it, expect } from "vitest";
import { parseSlackEvent } from "@/lib/slack/events";

const BOT = "U0BOT";

describe("parseSlackEvent", () => {
  it("returns the challenge for url_verification", () => {
    const r = parseSlackEvent({ type: "url_verification", challenge: "abc123" }, BOT);
    expect(r).toEqual({ kind: "challenge", challenge: "abc123" });
  });

  it("parses an app_mention, stripping the bot mention and keeping thread coords", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: {
          type: "app_mention",
          text: "<@U0BOT> what touches Stripe?",
          channel: "C123",
          user: "U0HUMAN",
          ts: "1720000000.000200",
          thread_ts: "1720000000.000100",
        },
      },
      BOT,
    );
    expect(r).toEqual({
      kind: "mention",
      text: "what touches Stripe?",
      channel: "C123",
      threadTs: "1720000000.000100",
      messageTs: "1720000000.000200",
      userId: "U0HUMAN",
    });
  });

  it("threads on the message ts when there is no parent thread_ts", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: { type: "app_mention", text: "<@U0BOT> hi", channel: "C1", user: "U9", ts: "1720000000.000300" },
      },
      BOT,
    );
    expect(r).toMatchObject({ kind: "mention", threadTs: "1720000000.000300" });
  });

  it("ignores events authored by a bot (no self-reply loops)", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: { type: "app_mention", text: "<@U0BOT> hi", channel: "C1", ts: "1.2", bot_id: "B999" },
      },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });

  it("ignores non-mention event types", () => {
    const r = parseSlackEvent(
      { type: "event_callback", event: { type: "message", text: "hello", channel: "C1", ts: "1.2" } },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });
});
