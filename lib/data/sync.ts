import "server-only";
import { loadInstance } from "./source";
import { getSnapshot, putSnapshot } from "@/lib/backoffice/store";
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

  const changes = new Map<string, ChangeEvent[]>();
  let changed = 0;

  for (const workflow of workflows as N8nWorkflow[]) {
    const snap = snapshot(workflow);
    const prevRow = await getSnapshot(workflow.id);
    if (prevRow && prevRow.hash !== snap.hash) {
      const prevFields = JSON.parse(prevRow.json) as SnapshotFields;
      const events = diffFields(prevFields, snapshotFields(workflow));
      if (events.length) {
        changes.set(workflow.id, events);
        changed++;
      }
    }
    await putSnapshot(workflow.id, snap.hash, JSON.stringify(snap.fields));
  }

  return { changes, scanned: workflows.length, changed };
}
