// Pure parsing of the Slack Events API envelope for the Otto coworker.
// No I/O — the route handler does verification, fetching, and replying.

export interface TurnEvent {
  text: string;
  channel: string;
  threadTs: string;
  messageTs: string;
  userId: string | null;
}

export type ParsedSlackEvent =
  | { kind: "challenge"; challenge: string }
  // A direct @mention — always answered.
  | ({ kind: "mention" } & TurnEvent)
  // An untagged reply inside a thread. The route answers only if Otto is already
  // part of that thread (it posted the brief/alert or was mentioned earlier).
  | ({ kind: "reply" } & TurnEvent)
  | { kind: "ignore" };

interface AppMention {
  type?: string;
  subtype?: string;
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

export function parseSlackEvent(body: unknown, botUserId: string): ParsedSlackEvent {
  const env = (body ?? {}) as Envelope;

  if (env.type === "url_verification" && typeof env.challenge === "string") {
    return { kind: "challenge", challenge: env.challenge };
  }

  const event = env.event;
  if (env.type !== "event_callback" || !event) return { kind: "ignore" };
  // Never react to our own (or any bot's) messages — avoids reply loops.
  if (event.bot_id) return { kind: "ignore" };
  if (!event.channel || !event.ts) return { kind: "ignore" };

  if (event.type === "app_mention") {
    return {
      kind: "mention",
      text: stripMentions(event.text ?? ""),
      channel: event.channel,
      threadTs: event.thread_ts ?? event.ts,
      messageTs: event.ts,
      userId: event.user ?? null,
    };
  }

  // A plain message: only a candidate when it's an untagged, human, threaded
  // reply. We skip subtypes (edits/joins/etc.), non-threaded top-level messages,
  // our own user id, and messages that tag the bot — those also arrive as
  // `app_mention`, and handling both would double-reply.
  if (event.type === "message") {
    if (event.subtype) return { kind: "ignore" };
    if (!event.thread_ts) return { kind: "ignore" };
    if (event.user && event.user === botUserId) return { kind: "ignore" };
    const text = event.text ?? "";
    if (botUserId && text.includes(`<@${botUserId}>`)) return { kind: "ignore" };
    return {
      kind: "reply",
      text: stripMentions(text),
      channel: event.channel,
      threadTs: event.thread_ts,
      messageTs: event.ts,
      userId: event.user ?? null,
    };
  }

  return { kind: "ignore" };
}
