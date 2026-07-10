import "server-only";
import { slackClient } from "./post";
import type { ChatMessage } from "@/lib/agent/run";

// Claude-tag behavior: when Otto is @mentioned in a thread, it reads that
// thread's recent messages and answers in context. We map Slack messages to
// chat roles (Otto's own posts → assistant, everyone else → user) and drop the
// triggering mention (the route passes its text as the fresh user turn).
const THREAD_SCOPE = 50;

function stripMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchThreadHistory(
  botToken: string,
  channel: string,
  threadTs: string,
  excludeTs: string,
): Promise<ChatMessage[]> {
  try {
    const res = await slackClient(botToken).conversations.replies({
      channel,
      ts: threadTs,
      limit: THREAD_SCOPE,
    });
    const messages = res.messages ?? [];
    return messages
      .filter((m) => m.ts !== excludeTs && typeof m.text === "string" && m.text.trim().length > 0)
      .map((m) => ({
        role: m.bot_id ? "assistant" : "user",
        content: stripMentions(m.text as string),
      }));
  } catch {
    // Missing history scope or a top-level mention with no thread — answer
    // without prior context rather than failing the whole turn.
    return [];
  }
}
