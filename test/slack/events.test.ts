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

  it("ignores a top-level message with no thread (not a reply)", () => {
    const r = parseSlackEvent(
      { type: "event_callback", event: { type: "message", text: "hello", channel: "C1", ts: "1.2" } },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });

  it("parses an untagged threaded reply as kind 'reply'", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: {
          type: "message",
          text: "why did it fail?",
          channel: "C1",
          user: "U0HUMAN",
          ts: "1720000000.000400",
          thread_ts: "1720000000.000100",
        },
      },
      BOT,
    );
    expect(r).toEqual({
      kind: "reply",
      text: "why did it fail?",
      channel: "C1",
      threadTs: "1720000000.000100",
      messageTs: "1720000000.000400",
      userId: "U0HUMAN",
    });
  });

  it("ignores a threaded message that tags the bot (the app_mention twin handles it)", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: {
          type: "message",
          text: "<@U0BOT> and now?",
          channel: "C1",
          user: "U0HUMAN",
          ts: "1.5",
          thread_ts: "1.1",
        },
      },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });

  it("ignores a threaded message authored by the bot's own user id", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: { type: "message", text: "my own reply", channel: "C1", user: BOT, ts: "1.6", thread_ts: "1.1" },
      },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });

  it("ignores message subtypes (edits, joins, etc.)", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: { type: "message", subtype: "message_changed", text: "edited", channel: "C1", ts: "1.7", thread_ts: "1.1" },
      },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });

  it("answers an untagged top-level DM as kind 'dm' (threading under itself)", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "im",
          text: "who owns Sync Linked?",
          channel: "D123",
          user: "U0HUMAN",
          ts: "1720000000.000500",
        },
      },
      BOT,
    );
    expect(r).toEqual({
      kind: "dm",
      text: "who owns Sync Linked?",
      channel: "D123",
      threadTs: "1720000000.000500",
      messageTs: "1720000000.000500",
      userId: "U0HUMAN",
    });
  });

  it("keeps an in-DM thread in context when the user replies threaded", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "im",
          text: "and its blast radius?",
          channel: "D123",
          user: "U0HUMAN",
          ts: "1720000000.000600",
          thread_ts: "1720000000.000500",
        },
      },
      BOT,
    );
    expect(r).toMatchObject({ kind: "dm", threadTs: "1720000000.000500" });
  });

  it("ignores a DM that tags the bot (the app_mention twin handles it — no double reply)", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: { type: "message", channel_type: "im", text: "<@U0BOT> hi", channel: "D123", user: "U0HUMAN", ts: "1.8" },
      },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });

  it("ignores the bot's own DM messages (no self-reply loop)", () => {
    const r = parseSlackEvent(
      {
        type: "event_callback",
        event: { type: "message", channel_type: "im", text: "my answer", channel: "D123", user: BOT, ts: "1.9" },
      },
      BOT,
    );
    expect(r).toEqual({ kind: "ignore" });
  });
});
