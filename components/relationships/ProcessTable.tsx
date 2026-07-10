"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { relativeTime } from "@/lib/format";
import type { GroupsView } from "@/lib/data/map";

/** List of SOP processes (epics). Click a row to open its detail page. */
export function ProcessTable({ rows }: GroupsView) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function createSop(name: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/process-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const sop = (await res.json()) as { id?: string };
      setDialogOpen(false);
      if (sop.id) router.push(`/map/sop/${sop.id}`);
      else start(() => router.refresh());
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Processes</span>
        <Button variant="primary" onClick={() => setDialogOpen(true)} disabled={creating || pending}>
          + New process
        </Button>
      </div>

      <PromptDialog
        open={dialogOpen}
        title="New process"
        label="Name this SOP — you can add workflows to it next."
        placeholder="e.g. Client onboarding"
        submitLabel="Create"
        busy={creating}
        onSubmit={createSop}
        onClose={() => setDialogOpen(false)}
      />

      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 py-12 text-center text-[13px] text-muted">
          <div>
            <p className="mb-1 text-ink">No processes yet.</p>
            <p className="text-faint">Create an SOP, then add the workflows that belong to it.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-panel-2 text-[11px] tracking-wide text-faint uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Process</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="w-24 px-4 py-2 text-right font-medium">Workflows</th>
                <th className="w-28 px-4 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/map/sop/${r.id}`)}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-panel-2"
                >
                  <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                  <td className="max-w-[420px] truncate px-4 py-2.5 text-muted">
                    {r.description || <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right nums text-muted">{r.workflowCount}</td>
                  <td className="px-4 py-2.5 text-right nums text-faint">{relativeTime(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
