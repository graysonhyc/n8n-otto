import "server-only";
import { getAllOwners, getBriefStates, getSlackInstall } from "@/lib/backoffice/store";
import { loadDailyBrief } from "@/lib/data/brief";
import { getMasterChannelId, postBlocks } from "@/lib/slack/post";
import { resolveRouting } from "@/lib/slack/route";
import { briefItemBlocks } from "@/lib/slack/blocks";

export type EscalateResult =
  | { ok: false; status: number; error: string }
  | { ok: true; escalated: number };

// Ownership SLA: high-severity attention items that are still unacknowledged get
// re-pinged — to the owner's dedicated escalation channel when set, else the
// owner channel, else master. Runs daily after the brief; "still unacknowledged"
// is the trigger, so no per-item timers/state are needed.
export async function escalateUnacked(): Promise<EscalateResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const master = await getMasterChannelId(install.botToken);
  if (!master) return { ok: false, status: 400, error: "Could not find #n8n-backoffice channel" };

  const [{ attention }, owners, states] = await Promise.all([
    loadDailyBrief(),
    getAllOwners(),
    getBriefStates(),
  ]);

  const pending = attention.filter((i) => i.severity === "high" && states.get(i.key) !== "acknowledged");

  let escalated = 0;
  for (const item of pending) {
    const owner = item.workflowId ? owners.get(item.workflowId) ?? null : null;
    // Prefer the escalation channel; fall back to the owner/master routing.
    const channelId = owner?.escalationChannelId ?? resolveRouting(owner, master).channelId;
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
