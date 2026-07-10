import { after, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { parseSlackEvent } from "@/lib/slack/events";
import { getSlackInstall } from "@/lib/backoffice/store";
import { slackClient } from "@/lib/slack/post";
import { fetchThreadHistory } from "@/lib/slack/thread";
import { buildAgentContext } from "@/lib/agent/load";
import { openaiFromEnv } from "@/lib/agent/openai";
import { runAgent } from "@/lib/agent/run";

export const dynamic = "force-dynamic";

const ACK = new NextResponse(null, { status: 200 });

// Inbound Slack Events endpoint for the Otto coworker. Acks within Slack's 3s
// window, then does the real work (read thread → run agent → reply) in after().
export async function POST(request: Request) {
  const raw = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (
    !signingSecret ||
    !verifySlackRequest({
      signingSecret,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      body: raw,
      signature: request.headers.get("x-slack-signature"),
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Slack re-delivers on our slow ack; we already scheduled the first one.
  if (request.headers.get("x-slack-retry-num")) return ACK;

  const install = await getSlackInstall();
  if (!install) return ACK; // not connected — nothing to answer with

  const body = JSON.parse(raw || "{}");
  const parsed = parseSlackEvent(body, install.botUserId);

  if (parsed.kind === "challenge") return NextResponse.json({ challenge: parsed.challenge });
  if (parsed.kind === "ignore") return ACK;

  const { channel, threadTs, messageTs, text } = parsed;
  const { botToken } = install;
  const client = slackClient(botToken);

  after(async () => {
    // "on it" affordance — the Claude-tag working state.
    void client.reactions.add({ channel, timestamp: messageTs, name: "eyes" }).catch(() => {});
    const placeholder = await client.chat
      .postMessage({ channel, thread_ts: threadTs, text: "🧠 Reading the thread…" })
      .catch(() => null);
    const placeholderTs = placeholder?.ts;

    const reply = async (answer: string) => {
      if (placeholderTs) {
        await client.chat.update({ channel, ts: placeholderTs, text: answer }).catch(() => {});
      } else {
        await client.chat.postMessage({ channel, thread_ts: threadTs, text: answer }).catch(() => {});
      }
      void client.reactions.remove({ channel, timestamp: messageTs, name: "eyes" }).catch(() => {});
    };

    const openai = openaiFromEnv();
    if (!openai) {
      await reply("I'm not fully configured yet — set `OPENAI_API_KEY` so I can think.");
      return;
    }

    try {
      const [context, history] = await Promise.all([
        buildAgentContext(),
        fetchThreadHistory(botToken, channel, threadTs, messageTs),
      ]);
      const { text: answer } = await runAgent({ userText: text, context, client: openai, history });
      await reply(answer || "I didn't find anything to say about that.");
    } catch (err) {
      await reply(`Something went wrong working that out: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  });

  return ACK;
}
