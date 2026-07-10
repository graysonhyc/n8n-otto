// Pure parsing of the Slack Events API envelope for the Otto coworker.
// No I/O — the route handler does verification, fetching, and replying.

export type ParsedSlackEvent =
  | { kind: "challenge"; challenge: string }
  | { kind: "mention"; text: string; channel: string; threadTs: string; userId: string | null }
  | { kind: "ignore" };

interface AppMention {
  type?: string;
  text?: string;
  channel?: string;
  user?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

interface Envelope {
  type?: string;
  challenge?: string;
  event?: AppMention;
}

/** Remove every `<@Uxxxx>` user mention (incl. the bot) and collapse whitespace. */
function stripMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").replace(/\s+/g, " ").trim();
}

export function parseSlackEvent(body: unknown, _botUserId: string): ParsedSlackEvent {
  const env = (body ?? {}) as Envelope;

  if (env.type === "url_verification" && typeof env.challenge === "string") {
    return { kind: "challenge", challenge: env.challenge };
  }

  const event = env.event;
  if (env.type !== "event_callback" || !event || event.type !== "app_mention") {
    return { kind: "ignore" };
  }
  // Never react to our own (or any bot's) messages — avoids reply loops.
  if (event.bot_id) return { kind: "ignore" };
  if (!event.channel || !event.ts) return { kind: "ignore" };

  return {
    kind: "mention",
    text: stripMentions(event.text ?? ""),
    channel: event.channel,
    threadTs: event.thread_ts ?? event.ts,
    userId: event.user ?? null,
  };
}
