"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type RelView = "groups" | "auto";

const MODES: { value: RelView; label: string }[] = [
  { value: "groups", label: "Process groups" },
  { value: "auto", label: "Deterministic" },
];

/** Segmented control switching the Relationships page between its two modes. */
export function ModeToggle({ view }: { view: RelView }) {
  const router = useRouter();
  const params = useSearchParams();

  function select(next: RelView) {
    if (next === view) return;
    const q = new URLSearchParams(params.toString());
    q.set("view", next);
    router.push(`/map?${q.toString()}`);
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => select(m.value)}
          className={`px-3 py-1.5 transition-colors ${
            view === m.value ? "bg-accent-dim text-accent" : "text-muted hover:bg-panel-3"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
