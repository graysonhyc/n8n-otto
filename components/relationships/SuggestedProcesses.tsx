"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { SopSuggestion } from "@/lib/derive/suggestions";

/**
 * Deterministic clusters that look like an SOP but aren't one yet, surfaced as
 * accept/dismiss cards above the process table. Accepting either creates a new
 * SOP (auto-named, rename later) or adds the missing workflows to an existing one.
 */
export function SuggestedProcesses({ suggestions }: { suggestions: SopSuggestion[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  async function createSop(s: SopSuggestion) {
    setBusyId(s.id);
    try {
      const res = await fetch("/api/process-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Process (${s.memberIds.length} workflows)`, memberIds: s.memberIds }),
      });
      const sop = (await res.json()) as { id?: string };
      if (sop.id) router.push(`/map/sop/${sop.id}`);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function addToSop(s: SopSuggestion) {
    if (!s.targetSopId) return;
    setBusyId(s.id);
    try {
      for (const workflowId of s.memberIds) {
        await fetch("/api/process-groups/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowId, groupId: s.targetSopId }),
        });
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(s: SopSuggestion) {
    setBusyId(s.id);
    try {
      await fetch("/api/suggestions/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Suggested processes</span>
        <span className="text-[11px] text-faint nums">{suggestions.length} detected</span>
      </div>
      <ul className="divide-y divide-line">
        {suggestions.map((s) => {
          const busy = busyId === s.id;
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] whitespace-nowrap ${
                  s.confidence === "strong"
                    ? "border-accent-dim bg-accent-dim/40 text-accent"
                    : "border-line text-muted bg-panel-3"
                }`}
              >
                {s.confidence === "strong" ? "Likely" : "Possible"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">
                  {s.kind === "add-to-sop" ? (
                    <>
                      <b className="nums">{s.memberIds.length}</b> workflow{s.memberIds.length === 1 ? "" : "s"} that{" "}
                      {s.reason} belong with{" "}
                      <span className="text-accent">{s.targetSopName}</span>
                    </>
                  ) : (
                    <>
                      <b className="nums">{s.memberIds.length}</b> workflows {s.reason}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {s.kind === "add-to-sop" ? (
                  <Button variant="primary" onClick={() => addToSop(s)} disabled={busy}>
                    {busy ? "Adding…" : `Add to ${s.targetSopName}`}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => createSop(s)} disabled={busy}>
                    {busy ? "Creating…" : "Create SOP"}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => dismiss(s)} disabled={busy} aria-label="Dismiss suggestion">
                  Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
