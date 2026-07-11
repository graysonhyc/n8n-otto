"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Two-field modal for creating an SOP from a suggested cluster: a name and a
 * description, both PREFILLED with the agent's recommendation but fully editable.
 * The parent mounts this fresh per suggestion (via `key`), so initial props seed
 * the fields with no reset effect. The recommended name may arrive async — until
 * the user edits, the field simply reflects the latest `initialName` prop.
 */
export function SopCreateDialog({
  initialName,
  initialDescription,
  nameLoading = false,
  busy = false,
  memberNames,
  onSubmit,
  onClose,
}: {
  initialName: string;
  initialDescription: string;
  nameLoading?: boolean;
  busy?: boolean;
  memberNames: string[];
  onSubmit: (value: { name: string; description: string }) => void;
  onClose: () => void;
}) {
  const [typedName, setTypedName] = useState<string | null>(null);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Show what the user typed; otherwise the agent's recommendation (which may
  // still be loading, hence the empty fallback).
  const name = typedName ?? initialName;
  const trimmed = name.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    onSubmit({ name: trimmed, description: description.trim() });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line-2 bg-panel-2 p-5 shadow-xl shadow-black/50"
      >
        <h2 className="text-[14px] font-semibold text-ink">Create SOP</h2>
        <p className="mt-1 text-[12px] text-muted">
          {memberNames.length} workflow{memberNames.length === 1 ? "" : "s"}:{" "}
          <span className="text-faint">{memberNames.join(", ")}</span>
        </p>

        <label className="mt-4 block text-[11px] font-semibold tracking-wide text-faint uppercase">
          Name
          {nameLoading && <span className="ml-2 lowercase text-faint">· suggesting…</span>}
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="e.g. Refund Processing"
          className="mt-1.5 w-full rounded-lg border border-line bg-panel-3 px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />

        <label className="mt-4 block text-[11px] font-semibold tracking-wide text-faint uppercase">
          Description <span className="lowercase text-faint">· agent recommendation</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What this process does and why these workflows belong together."
          className="mt-1.5 w-full resize-y rounded-lg border border-line bg-panel-3 px-3 py-2 text-[13px] leading-snug text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!trimmed || busy}>
            {busy ? "Creating…" : "Create SOP"}
          </Button>
        </div>
      </form>
    </div>
  );
}
