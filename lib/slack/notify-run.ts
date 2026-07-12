import "server-only";
import {
  getAllOwners,
  getBriefStates,
  getSlackInstall,
  getNotifiedKeys,
  markNotified,
  clearNotified,
  getLastSweepAt,
  touchSweep,
} from "@/lib/backoffice/store";
import { loadBrief } from "@/lib/data/brief";
import { masterChannelId, postBlocks } from "@/lib/slack/post";
import { briefItemBlocks } from "@/lib/slack/blocks";
import { notifyNewItems } from "@/lib/slack/notify";

export type SweepResult =
  | { ok: false; status: number; error: string }
  | { ok: true; posted: number; rearmed: number }
  | { ok: true; skipped: "debounced" };

// Loads live brief data + effects and runs the sweep. `debounceMs > 0` skips the
// run when another sweep ran within the window (webhook chatter guard); the
// timestamp is written before the heavy load so concurrent calls debounce too.
// Kept separate from the pure `notify.ts` so tests can import that without the
// `server-only` boundary tripping under vitest.
export async function runNotifySweep(opts?: { debounceMs?: number }): Promise<SweepResult> {
  const install = await getSlackInstall();
  if (!install) return { ok: false, status: 400, error: "Slack not connected" };

  const debounceMs = opts?.debounceMs ?? 0;
  if (debounceMs > 0) {
    const last = await getLastSweepAt();
    if (last && Date.now() - last.getTime() < debounceMs) return { ok: true, skipped: "debounced" };
  }
  await touchSweep();

  const [{ items }, owners, notified, states] = await Promise.all([
    loadBrief(),
    getAllOwners(),
    getNotifiedKeys(),
    getBriefStates(),
  ]);

  const res = await notifyNewItems({
    items,
    owners,
    notified,
    states,
    post: (channelId, item) => postBlocks(install.botToken, channelId, briefItemBlocks(item), item.title),
    markNotified,
    clearNotified,
    masterChannelId: masterChannelId(),
  });
  return { ok: true, ...res };
}
