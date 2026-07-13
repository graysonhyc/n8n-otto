import type { N8nExecution, N8nWorkflow } from "@/lib/n8n/types";

// Demo execution overlay. The self-hosted n8n instance has almost no execution
// history (one workflow runs daily; zero failures), so the daily brief's
// "yesterday" recap, the errors views, and ROI are empty on a live demo. This
// synthesises a plausible ~10-day history mapped onto the REAL workflow ids so
// those surfaces have meaningful data — without writing to the n8n execution
// store. It is demo scaffolding, gated by DEMO_EXECUTIONS in loadInstance; the
// workflows themselves stay live and real.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const HISTORY_DAYS = 10;

// Workflows given a healthy run history. Matched by name so this survives id
// changes; any name not present in the live estate is simply skipped. These
// should be the active, scheduled workflows (only active non-manual workflows
// count toward the brief's yesterday recap).
// The first two are active in the live estate, so their runs land in the brief's
// yesterday recap (which only counts active workflows). The rest are inactive but
// still get history so the estate's ROI/overview reads as a productive estate.
const HEALTHY_NAMES = [
  // Downstream half of the Refund SOP + its Stripe sibling — healthy, so the
  // incident is isolated to the failing head (below) and the blast radius has
  // live neighbours to name.
  "Refund Execution",
  "Dunning Retry",
  // IT SOP + the rest of the estate — productive history so ROI/overview reads
  // as a real, busy estate around the one incident.
  "Access Provisioning",
  "Employee Offboarding",
  "Incident Triage Agent",
  "Churn Risk Agent",
  "Health Score Sync",
  "NPS Follow-up",
  // Original content-sync workflows (active in the live estate).
  "Sync Youtube Content Database",
  "Sync Linked Content Database",
  "Scrape LinkedIn job listings",
  "AI-Powered Invoice Reminder & Payment Tracker for Finance & Accounting",
];

// One workflow is made to fail over the last two days (incl. yesterday) so there
// is a real incident to anchor the demo on — the HEAD of the Refund SOP. It calls
// Refund Execution (which issues the Stripe refund), so a failing head means
// refunds are neither decided nor paid: a high-severity, money-moving incident
// whose blast radius (SOP + shared Stripe credential) is the story.
const FAILING_NAME = "Refund Review Agent";

function exec(id: string, startedAtMs: number, status: N8nExecution["status"], durMs: number): N8nExecution {
  return {
    id: `demo-${id}-${startedAtMs}`,
    workflowId: id,
    finished: true,
    status,
    startedAt: new Date(startedAtMs).toISOString(),
    stoppedAt: new Date(startedAtMs + durMs).toISOString(),
  };
}

export function demoExecutionOverlay(workflows: N8nWorkflow[], now: number): N8nExecution[] {
  const idByName = new Map(workflows.map((w) => [w.name, w.id]));
  const out: N8nExecution[] = [];

  for (const name of HEALTHY_NAMES) {
    const id = idByName.get(name);
    if (!id) continue;
    // Three successful runs per day for the past HISTORY_DAYS days — enough that
    // the yesterday recap reads busy and mostly-green even with a couple of the
    // healthy workflows left inactive.
    for (let d = 1; d <= HISTORY_DAYS; d++) {
      const midnight = now - d * DAY_MS;
      out.push(exec(id, midnight - 12 * HOUR_MS, "success", 44_000));
      out.push(exec(id, midnight - 9 * HOUR_MS, "success", 45_000));
      out.push(exec(id, midnight - 2 * HOUR_MS, "success", 38_000));
    }
  }

  const failId = idByName.get(FAILING_NAME);
  if (failId) {
    // Healthy until two days ago, then failing — so the incident is fresh and the
    // "yesterday" recap shows the error, while history shows it used to work.
    for (let d = 3; d <= HISTORY_DAYS; d++) {
      const midnight = now - d * DAY_MS;
      out.push(exec(failId, midnight - 5 * HOUR_MS, "success", 41_000));
    }
    for (let d = 1; d <= 2; d++) {
      const midnight = now - d * DAY_MS;
      out.push(exec(failId, midnight - 5 * HOUR_MS, "error", 12_000));
      out.push(exec(failId, midnight - 3 * HOUR_MS, "error", 9_000));
    }
  }

  return out;
}
