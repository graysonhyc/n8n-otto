import "server-only";
import { loadInstance } from "./source";
import { getSnapshot, getAllSnapshots, putSnapshot, putSnapshots } from "@/lib/backoffice/store";
import {
  diffFields,
  snapshot,
  snapshotFields,
  type ChangeEvent,
  type SnapshotFields,
} from "@/lib/diff/snapshot";
import { refundReviewAgentPrev } from "@/lib/demo/fixtures";
import type { N8nWorkflow } from "@/lib/n8n/types";

export interface SyncResult {
  changes: Map<string, ChangeEvent[]>;
  scanned: number;
  changed: number;
}

// On demo data, seed the anchor agent's *previous* snapshot once so the first
// sync detects the summarise → decide prompt change (the demo's key moment).
async function seedDemoBaseline(): Promise<void> {
  const existing = await getSnapshot(refundReviewAgentPrev.id);
  if (existing) return;
  const prev = snapshot(refundReviewAgentPrev);
  await putSnapshot(refundReviewAgentPrev.id, prev.hash, JSON.stringify(prev.fields));
}

export async function runSync(): Promise<SyncResult> {
  const { workflows, live } = await loadInstance();
  if (!live) await seedDemoBaseline();

  // One read for every prior snapshot, instead of a findUnique per workflow.
  const prev = await getAllSnapshots();
  const changes = new Map<string, ChangeEvent[]>();
  const writes: { workflowId: string; hash: string; json: string }[] = [];
  let changed = 0;

  for (const workflow of workflows as N8nWorkflow[]) {
    const snap = snapshot(workflow);
    const prevRow = prev.get(workflow.id);
    if (prevRow && prevRow.hash !== snap.hash) {
      const prevFields = JSON.parse(prevRow.json) as SnapshotFields;
      const events = diffFields(prevFields, snapshotFields(workflow));
      if (events.length) {
        changes.set(workflow.id, events);
        changed++;
      }
    }
    // Persist only new or changed snapshots. Re-writing an identical hash was
    // pure overhead — in steady state nothing changes and no write is issued.
    if (!prevRow || prevRow.hash !== snap.hash) {
      writes.push({ workflowId: workflow.id, hash: snap.hash, json: JSON.stringify(snap.fields) });
    }
  }

  await putSnapshots(writes);

  return { changes, scanned: workflows.length, changed };
}
