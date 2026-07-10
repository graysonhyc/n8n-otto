import "server-only";
import { getAllOwners, getBriefStates, getSlackInstall } from "@/lib/backoffice/store";
import { loadDailyBrief } from "@/lib/data/brief";
import { postBlocks } from "@/lib/slack/post";
import { briefItemBlocks } from "@/lib/slack/blocks";

export type EscalateResult =
  | { ok: false; status: number; error: string }
  | { ok: true; escalated: number };

// Ownership SLA: high-severity attention items that are still unacknowledged get
// re-pinged — to the owner's dedicated escalation channel when set, else the
// owner channel. Items whose workflow has no channel are skipped (no master
// channel). Runs daily after the brief; "still unacknowledged" is the trigger,
// so no per-item timers/state are needed.
export async function escalateUnacked(): Promise<EscalateResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const [{ attention }, owners, states] = await Promise.all([
    loadDailyBrief(),
    getAllOwners(),
    getBriefStates(),
  ]);

  const pending = attention.filter((i) => i.severity === "high" && states.get(i.key) !== "acknowledged");

  let escalated = 0;
  for (const item of pending) {
    const owner = item.workflowId ? owners.get(item.workflowId) ?? null : null;
    const channelId = owner?.escalationChannelId ?? owner?.slackChannelId;
    if (!channelId) continue; // unowned → skipped
    await postBlocks(
      install.botToken,
      channelId,
      briefItemBlocks(item, "⏫ Escalation — still unacknowledged"),
      `Escalation: ${item.title}`,
    );
    escalated++;
  }

  return { ok: true, escalated };
}
