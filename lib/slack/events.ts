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
  // A 1-on-1 direct message — always answered, even the first one, no @mention
  // needed. In a DM Otto is the only other party, so every human message is a
  // question for it.
  | ({ kind: "dm" } & TurnEvent)
  // An untagged reply inside a thread. The route answers only if Otto is already
  // part of that thread (it posted the brief/alert or was mentioned earlier).
  | ({ kind: "reply" } & TurnEvent)
  | { kind: "ignore" };

interface AppMention {
  type?: string;
  subtype?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
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

  // A plain message. We skip subtypes (edits/joins/etc.), our own messages, and
  // any message that tags the bot — a tagged message also arrives as
  // `app_mention` (in channels *and* DMs), and handling both would double-reply.
  if (event.type === "message") {
    if (event.subtype) return { kind: "ignore" };
    if (event.user && event.user === botUserId) return { kind: "ignore" };
    const text = event.text ?? "";
    if (botUserId && text.includes(`<@${botUserId}>`)) return { kind: "ignore" };

    // A 1-on-1 DM: answer every untagged message, top-level or threaded, even the
    // first one — no thread membership needed. `thread_ts ?? ts` keeps an in-DM
    // thread in context while letting a top-level DM reply under itself.
    if (event.channel_type === "im") {
      return {
        kind: "dm",
        text: stripMentions(text),
        channel: event.channel,
        threadTs: event.thread_ts ?? event.ts,
        messageTs: event.ts,
        userId: event.user ?? null,
      };
    }

    // Otherwise a channel message: only a candidate when it's an untagged,
    // threaded reply. Non-threaded top-level channel chatter is ignored so Otto
    // doesn't wake on every message.
    if (!event.thread_ts) return { kind: "ignore" };
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
