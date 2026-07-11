"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * A themed replacement for window.prompt — a single-field modal for naming things.
 * Controlled by `open`; calls `onSubmit` with the trimmed value, `onClose` to dismiss.
 */
export function PromptDialog({
  open,
  title,
  label,
  placeholder,
  initialValue = "",
  submitLabel = "Save",
  busy = false,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset field to the seed value each time the dialog opens, then focus + select it.
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const id = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(id);
  }, [open, initialValue]);

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = value.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-line-2 bg-panel p-5 shadow-pop"
      >
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {label && <p className="mt-1 text-[12px] text-muted">{label}</p>}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="mt-3 w-full rounded-lg border border-line bg-panel-3 px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!trimmed || busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
