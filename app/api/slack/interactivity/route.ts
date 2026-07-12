import { after, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import {
  assignMember,
  createSop,
  getSlackInstall,
  setBriefState,
  setOwner,
  setSuggestionState,
} from "@/lib/backoffice/store";
import { linearFromEnv } from "@/lib/linear/client";
import { buildAgentContext } from "@/lib/agent/load";
import { blastRadius } from "@/lib/derive/blast";
import { buildTicket } from "@/lib/linear/ticket";
import { workflowUrlFromEnv } from "@/lib/n8n/links";
import { slackClient } from "@/lib/slack/post";

interface SlackAction {
  action_id: string;
  value?: string;
}
interface SlackPayload {
  actions?: SlackAction[];
  channel?: { id?: string };
  message?: { ts?: string; thread_ts?: string };
  container?: { message_ts?: string };
}

// Resolve the outcome text for a clicked action, running any state mutation it
// implies. Pure of Slack transport — the caller posts the returned text.
async function runAction(actionId: string, value: Record<string, string>): Promise<string> {
  switch (actionId) {
    case "acknowledge":
      if (value.key) await setBriefState(value.key, "acknowledged");
      return "✓ Acknowledged. Tracked in Otto.";
    case "approve_change":
      if (value.key) await setBriefState(value.key, "acknowledged");
      return "✓ Change approved.";
    case "confirm_owner":
      if (value.workflowId && value.team) {
        await setOwner({ workflowId: value.workflowId, team: value.team, confirmed: true, source: "confirmed" });
      }
      return `✓ Owner confirmed: ${value.team ?? ""}.`;
    case "reject_owner":
      return "Noted — owner suggestion rejected.";
    case "create_sop_from_suggestion":
      if (value.memberIds) {
        const ids = JSON.parse(value.memberIds) as string[];
        await createSop(value.name || `Process (${ids.length} workflows)`, ids, value.description || null);
        if (value.suggestionId) await setSuggestionState(value.suggestionId, "notified");
      }
      return "✓ SOP created in Otto. Ask me “is that process healthy?” to see it end-to-end.";
    case "add_to_sop_suggestion":
      if (value.memberIds && value.targetSopId) {
        for (const id of JSON.parse(value.memberIds) as string[]) await assignMember(id, value.targetSopId);
        if (value.suggestionId) await setSuggestionState(value.suggestionId, "notified");
      }
      return "✓ Workflows added to the SOP.";
    case "dismiss_suggestion":
      if (value.suggestionId) await setSuggestionState(value.suggestionId, "dismissed");
      return "Suggestion dismissed.";
    case "open_in_n8n": {
      const url = value.workflowId ? workflowUrlFromEnv(value.workflowId) : null;
      return url ? `Open in n8n: ${url}` : "n8n base URL isn't configured.";
    }
    case "rollback_prompt":
      return "Rollback requested — open the workflow in n8n to restore the previous prompt.";
    case "create_ticket": {
      const linear = linearFromEnv();
      if (!linear) return "Linear isn't configured — set `LINEAR_API_KEY` + `LINEAR_TEAM_ID`.";
      if (!value.workflowId) return "No workflow attached to that action.";
      try {
        const ctx = await buildAgentContext();
        const item = ctx.items.find((i) => i.id === value.workflowId);
        if (!item) return "Couldn't find that workflow anymore.";
        const blast = blastRadius(item.id, ctx.graph);
        const issue = await linear.createIssue(buildTicket({ item, blast, changes: [] }));
        return `✓ Linear ticket created — ${issue.identifier}: ${issue.url}`;
      } catch (err) {
        return `Couldn't create the ticket: ${err instanceof Error ? err.message : "unknown error"}`;
      }
    }
    default:
      return "Opening in n8n…";
  }
}

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const raw = await request.text();

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

  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get("payload") ?? "{}") as SlackPayload;
  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ ok: true });

  const value = action.value ? (JSON.parse(action.value) as Record<string, string>) : {};
  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts ?? payload.container?.message_ts;
  // Proactive cards are top-level messages, so their own ts roots the thread.
  const threadTs = payload.message?.thread_ts ?? messageTs;

  // Ack Slack within its 3s window; run the mutation + post the outcome into the
  // thread afterwards. Posting in-thread (not an ephemeral) keeps everyone in the
  // loop AND leaves Otto present in the thread, so an untagged follow-up like
  // "did the ticket file?" is answered without re-tagging.
  after(async () => {
    const text = await runAction(action.action_id, value);
    const install = await getSlackInstall();
    if (install && channel && threadTs) {
      await slackClient(install.botToken)
        .chat.postMessage({ channel, thread_ts: threadTs, text })
        .catch(() => {});
    }
  });

  return NextResponse.json({});
}
