"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SopCreateDialog } from "./SopCreateDialog";
import type { SopSuggestion } from "@/lib/derive/suggestions";

/**
 * Deterministic clusters that look like an SOP but aren't one yet, surfaced as
 * accept/dismiss cards above the process table. Accepting either creates a new
 * SOP (auto-named, rename later) or adds the missing workflows to an existing one.
 */
export function SuggestedProcesses({ suggestions }: { suggestions: SopSuggestion[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The suggestion whose create form is open, plus the agent-recommended name.
  const [drafting, setDrafting] = useState<SopSuggestion | null>(null);
  const [suggestedName, setSuggestedName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  if (suggestions.length === 0) return null;

  // Open the create form and fetch the agent's recommended name in the
  // background (description is prefilled from the rationale already on hand).
  function openCreate(s: SopSuggestion) {
    setDrafting(s);
    setSuggestedName("");
    setNameLoading(true);
    fetch("/api/process-groups/suggest-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberNames: s.memberNames ?? [], rationale: s.rationale }),
    })
      .then((r) => r.json())
      .then((d: { name?: string }) => setSuggestedName(d.name ?? ""))
      .catch(() => setSuggestedName(""))
      .finally(() => setNameLoading(false));
  }

  async function createSop(name: string, description: string) {
    const s = drafting;
    if (!s) return;
    setCreating(true);
    try {
      const res = await fetch("/api/process-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, memberIds: s.memberIds }),
      });
      const sop = (await res.json()) as { id?: string };
      setDrafting(null);
      if (sop.id) router.push(`/map/sop/${sop.id}`);
      else router.refresh();
    } finally {
      setCreating(false);
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
    <>
    {drafting && (
      <SopCreateDialog
        key={drafting.id}
        initialName={suggestedName}
        initialDescription={drafting.rationale ?? drafting.reason ?? ""}
        nameLoading={nameLoading}
        busy={creating}
        memberNames={drafting.memberNames ?? []}
        onSubmit={({ name, description }) => createSop(name, description)}
        onClose={() => setDrafting(null)}
      />
    )}
    <div className="mb-4 rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Suggested processes</span>
        <span className="text-[11px] text-faint nums">{suggestions.length} detected</span>
      </div>
      <ul className="divide-y divide-line">
        {suggestions.map((s) => {
          const busy = busyId === s.id;
          const names = s.memberNames ?? [];
          return (
            <li key={s.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] whitespace-nowrap ${
                  s.confidence === "strong"
                    ? "border-accent-dim bg-accent-dim/40 text-accent"
                    : "border-line text-muted bg-panel-3"
                }`}
              >
                {s.confidence === "strong" ? "Likely" : "Possible"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {names.map((n, i) => (
                    <span key={i} className="rounded border border-line-2 bg-panel-3 px-1.5 py-0.5 text-[11px] text-ink">
                      {n}
                    </span>
                  ))}
                  {s.kind === "add-to-sop" && (
                    <span className="text-[11px] text-faint">→ {s.targetSopName}</span>
                  )}
                </div>
                <p className="text-[13px] leading-snug text-muted">{s.rationale ?? s.reason}</p>
                {s.factLine && <p className="mt-1 text-[11px] text-faint">{s.factLine}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {s.kind === "add-to-sop" ? (
                  <Button variant="primary" onClick={() => addToSop(s)} disabled={busy}>
                    {busy ? "Adding…" : `Add to ${s.targetSopName}`}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => openCreate(s)} disabled={busy}>
                    Create SOP
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
    </>
  );
}
