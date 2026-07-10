import { NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { setBriefState, setOwner } from "@/lib/backoffice/store";
import { linearFromEnv } from "@/lib/linear/client";
import { buildAgentContext } from "@/lib/agent/load";
import { blastRadius } from "@/lib/derive/blast";
import { buildTicket } from "@/lib/linear/ticket";
import { workflowUrlFromEnv } from "@/lib/n8n/links";

interface SlackAction {
  action_id: string;
  value?: string;
}
interface SlackPayload {
  actions?: SlackAction[];
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
  let text = "Received.";

  switch (action.action_id) {
    case "acknowledge":
      if (value.key) await setBriefState(value.key, "acknowledged");
      text = "✓ Acknowledged. Tracked in Backoffice.";
      break;
    case "approve_change":
      if (value.key) await setBriefState(value.key, "acknowledged");
      text = "✓ Change approved.";
      break;
    case "confirm_owner":
      if (value.workflowId && value.team) {
        await setOwner({ workflowId: value.workflowId, team: value.team, confirmed: true, source: "confirmed" });
      }
      text = `✓ Owner confirmed: ${value.team ?? ""}.`;
      break;
    case "reject_owner":
      text = "Noted — owner suggestion rejected.";
      break;
    case "open_in_n8n": {
      const url = value.workflowId ? workflowUrlFromEnv(value.workflowId) : null;
      text = url ? `Open in n8n: ${url}` : "n8n base URL isn't configured.";
      break;
    }
    case "rollback_prompt":
      text = "Rollback requested — open the workflow in n8n to restore the previous prompt.";
      break;
    case "create_ticket": {
      const linear = linearFromEnv();
      if (!linear) {
        text = "Linear isn't configured — set `LINEAR_API_KEY` + `LINEAR_TEAM_ID`.";
        break;
      }
      if (!value.workflowId) {
        text = "No workflow attached to that action.";
        break;
      }
      try {
        const ctx = await buildAgentContext();
        const item = ctx.items.find((i) => i.id === value.workflowId);
        if (!item) {
          text = "Couldn't find that workflow anymore.";
          break;
        }
        const blast = blastRadius(item.id, ctx.graph);
        const issue = await linear.createIssue(buildTicket({ item, blast, changes: [] }));
        text = `✓ Linear ticket created — ${issue.identifier}: ${issue.url}`;
      } catch (err) {
        text = `Couldn't create the ticket: ${err instanceof Error ? err.message : "unknown error"}`;
      }
      break;
    }
    default:
      text = "Opening in n8n…";
  }

  // Replace the original message text with a confirmation.
  return NextResponse.json({ replace_original: false, response_type: "ephemeral", text });
}
