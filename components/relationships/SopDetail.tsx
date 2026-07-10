"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { colorFor } from "@/components/map/legend";
import { TYPE_LABEL } from "@/lib/format";
import type { SopDetailView } from "@/lib/data/map";

export function SopDetail({ sop, members, addable }: SopDetailView) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [desc, setDesc] = useState(sop.description ?? "");
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  const disabled = busy || pending;

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    try {
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      start(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const saveDesc = () =>
    call("/api/process-groups", "PATCH", { id: sop.id, description: desc.trim() || null });
  const addWorkflow = (workflowId: string) => {
    setPicking(false);
    setQuery("");
    void call("/api/process-groups/members", "POST", { workflowId, groupId: sop.id });
  };
  const removeWorkflow = (workflowId: string) =>
    void call("/api/process-groups/members", "DELETE", { workflowId });
  const deleteSop = () => {
    if (window.confirm(`Delete "${sop.name}"? Its workflows return to unassigned.`)) {
      setBusy(true);
      void fetch("/api/process-groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sop.id }),
      }).then(() => router.push("/map?view=groups"));
    }
  };

  const dirty = (sop.description ?? "") !== desc;
  const filtered = addable.filter((a) => a.wf.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* Description */}
      <section>
        <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-faint uppercase">
          Description
        </label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What is this process? What do these workflows accomplish together?"
          rows={3}
          className="w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-line-2 focus:outline-none"
        />
        {dirty && (
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={saveDesc} disabled={disabled}>Save description</Button>
            <Button variant="ghost" onClick={() => setDesc(sop.description ?? "")} disabled={disabled}>Cancel</Button>
          </div>
        )}
      </section>

      {/* Workflows */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide text-faint uppercase">
            Workflows · {members.length}
          </span>
          <Button variant="default" onClick={() => setPicking((p) => !p)} disabled={disabled}>
            {picking ? "Close" : "+ Add workflow"}
          </Button>
        </div>

        {picking && (
          <div className="mb-3 rounded-lg border border-line bg-panel-2 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workflows…"
              className="mb-2 w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-faint focus:border-line-2 focus:outline-none"
            />
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-[12px] text-faint">No workflows match.</p>
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.wf.id}
                    onClick={() => addWorkflow(a.wf.id)}
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-panel-3"
                  >
                    <span style={{ background: colorFor(a.wf, "risk") }} className="h-2 w-2 flex-none rounded-full" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{a.wf.name}</span>
                    {a.currentSopName && (
                      <span className="flex-none text-[10.5px] text-warn">moving from {a.currentSopName}</span>
                    )}
                    <span className="flex-none text-[11px] text-faint">{TYPE_LABEL[a.wf.type]}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {members.map((wf) => (
            <div key={wf.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
              <span style={{ background: colorFor(wf, "risk") }} className="h-2 w-2 flex-none rounded-full" />
              <button onClick={() => router.push(`/workflow/${wf.id}`)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[12.5px] font-medium text-ink hover:text-accent">{wf.name}</span>
                <span className="block truncate text-[10.5px] text-faint">
                  {TYPE_LABEL[wf.type]}
                  {wf.recentFailures > 0 && <span className="text-danger"> · {wf.recentFailures} recent fail</span>}
                </span>
              </button>
              <button
                onClick={() => removeWorkflow(wf.id)}
                disabled={disabled}
                className="flex-none text-[12px] text-faint hover:text-danger"
                aria-label="Remove from process"
              >✕</button>
            </div>
          ))}
          {members.length === 0 && (
            <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">
              No workflows yet — use “Add workflow” to build this process.
            </p>
          )}
        </div>
      </section>

      {/* Danger zone */}
      <section className="border-t border-line pt-4">
        <Button variant="ghost" onClick={deleteSop} disabled={disabled} className="!text-danger hover:!bg-[#2a1512]">
          Delete process
        </Button>
      </section>
    </div>
  );
}
