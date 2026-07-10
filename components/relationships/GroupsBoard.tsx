"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { colorFor } from "@/components/map/legend";
import { TYPE_LABEL } from "@/lib/format";
import type { GroupsView } from "@/lib/data/map";

type BoardWorkflow = GroupsView["workflowsById"][string];

/** Small workflow card used both inside SOP lanes and in the unassigned tray. */
function WorkflowCard({
  wf,
  onOpen,
  children,
}: {
  wf: BoardWorkflow;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
      <span style={{ background: colorFor(wf, "risk") }} className="h-2 w-2 flex-none rounded-full" />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12.5px] font-medium text-ink hover:text-accent">{wf.name}</span>
        <span className="block truncate text-[10.5px] text-faint">
          {TYPE_LABEL[wf.type]}
          {wf.recentFailures > 0 && <span className="text-danger"> · {wf.recentFailures} recent fail</span>}
        </span>
      </button>
      {children}
    </div>
  );
}

export function GroupsBoard({ sops, workflowsById, unassignedIds }: GroupsView) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    try {
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      start(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const createSop = () => {
    const name = window.prompt("Name this SOP (process)");
    if (name?.trim()) void call("/api/process-groups", "POST", { name: name.trim() });
  };
  const renameSop = (id: string, current: string) => {
    const name = window.prompt("Rename SOP", current);
    if (name?.trim() && name.trim() !== current) void call("/api/process-groups", "PATCH", { id, name: name.trim() });
  };
  const deleteSop = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"? Its workflows return to Unassigned.`)) {
      void call("/api/process-groups", "DELETE", { id });
    }
  };
  const assign = (workflowId: string, groupId: string) =>
    void call("/api/process-groups/members", "POST", { workflowId, groupId });
  const unassign = (workflowId: string) =>
    void call("/api/process-groups/members", "DELETE", { workflowId });
  const reorder = (groupId: string, ids: string[]) =>
    void call("/api/process-groups/members", "PATCH", { groupId, orderedWorkflowIds: ids });

  const disabled = busy || pending;

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
      {/* SOP lanes */}
      {sops.map((sop) => {
        const memberIds = sop.members.map((m) => m.workflowId);
        return (
          <section
            key={sop.id}
            className="flex w-[280px] flex-none flex-col rounded-xl border border-line bg-panel/60 p-3"
          >
            <header className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <button onClick={() => renameSop(sop.id, sop.name)} className="block truncate text-left text-[13px] font-semibold text-ink hover:text-accent">
                  {sop.name}
                </button>
                <span className="text-[10.5px] text-faint">{memberIds.length} workflow{memberIds.length === 1 ? "" : "s"}</span>
              </div>
              <button onClick={() => deleteSop(sop.id, sop.name)} disabled={disabled} className="flex-none text-[11px] text-faint hover:text-danger">
                Delete
              </button>
            </header>

            <div className="flex flex-col gap-2">
              {sop.members.map((m, i) => {
                const wf = workflowsById[m.workflowId];
                if (!wf) return null;
                return (
                  <WorkflowCard key={m.workflowId} wf={wf} onOpen={() => router.push(`/workflow/${wf.id}`)}>
                    <div className="flex flex-none flex-col text-faint">
                      <button
                        disabled={disabled || i === 0}
                        onClick={() => reorder(sop.id, move(memberIds, i, i - 1))}
                        className="leading-none hover:text-ink disabled:opacity-30"
                        aria-label="Move up"
                      >▲</button>
                      <button
                        disabled={disabled || i === memberIds.length - 1}
                        onClick={() => reorder(sop.id, move(memberIds, i, i + 1))}
                        className="leading-none hover:text-ink disabled:opacity-30"
                        aria-label="Move down"
                      >▼</button>
                    </div>
                    <button onClick={() => unassign(wf.id)} disabled={disabled} className="flex-none text-[11px] text-faint hover:text-danger" aria-label="Remove">✕</button>
                  </WorkflowCard>
                );
              })}
              {memberIds.length === 0 && (
                <p className="rounded-lg border border-dashed border-line px-2.5 py-3 text-center text-[11px] text-faint">
                  Assign workflows from Unassigned →
                </p>
              )}
            </div>
          </section>
        );
      })}

      {/* New SOP */}
      <div className="flex w-[200px] flex-none items-start">
        <Button variant="default" onClick={createSop} disabled={disabled}>+ New SOP</Button>
      </div>

      {/* Unassigned tray */}
      <section className="flex w-[280px] flex-none flex-col rounded-xl border border-dashed border-line bg-panel/30 p-3">
        <header className="mb-2">
          <span className="text-[13px] font-semibold text-muted">Unassigned</span>
          <span className="ml-2 text-[10.5px] text-faint">{unassignedIds.length}</span>
        </header>
        <div className="flex flex-col gap-2">
          {unassignedIds.map((id) => {
            const wf = workflowsById[id];
            if (!wf) return null;
            return (
              <WorkflowCard key={id} wf={wf} onOpen={() => router.push(`/workflow/${id}`)}>
                {sops.length > 0 ? (
                  <select
                    value=""
                    disabled={disabled}
                    onChange={(e) => e.target.value && assign(id, e.target.value)}
                    className="flex-none rounded-md border border-line bg-panel-3 px-1 py-0.5 text-[10.5px] text-muted"
                    aria-label="Assign to SOP"
                  >
                    <option value="">Assign…</option>
                    {sops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : null}
              </WorkflowCard>
            );
          })}
          {unassignedIds.length === 0 && (
            <p className="text-center text-[11px] text-faint">Every workflow is in an SOP.</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** Move item at `from` to index `to`, returning a new array. */
function move(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
