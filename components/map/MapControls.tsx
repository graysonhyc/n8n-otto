"use client";

import type { ColorBy, GraphNode } from "@/lib/derive/graph";
import { legendEntries } from "./legend";

const COLOR_MODES: { value: ColorBy; label: string }[] = [
  { value: "risk", label: "Risk" },
  { value: "type", label: "Type" },
  { value: "owner", label: "Owner" },
];

function Toggle({
  checked,
  onChange,
  label,
  swatch,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  swatch?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      {swatch && <span style={{ background: swatch }} className="h-2 w-2 flex-none rounded-full" />}
      {label}
    </label>
  );
}

export function MapControls({
  colorBy,
  onColorBy,
  showDataSources,
  onShowDataSources,
  showCredentials,
  onShowCredentials,
  onReset,
  nodes,
  live,
}: {
  colorBy: ColorBy;
  onColorBy: (c: ColorBy) => void;
  showDataSources: boolean;
  onShowDataSources: (v: boolean) => void;
  showCredentials: boolean;
  onShowCredentials: (v: boolean) => void;
  onReset: () => void;
  nodes: GraphNode[];
  live: boolean;
}) {
  return (
    <div className="absolute top-3 right-3 z-10 w-[200px] rounded-xl border border-line bg-panel-2/95 p-3 text-[11.5px] shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold tracking-[0.1em] text-faint uppercase">Color by</span>
        {!live && <span className="text-[9.5px] text-faint">demo</span>}
      </div>
      <div className="mb-3 flex overflow-hidden rounded-md border border-line">
        {COLOR_MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onColorBy(m.value)}
            className={`flex-1 py-1 transition-colors ${
              colorBy === m.value
                ? "bg-accent-dim text-accent"
                : "text-muted hover:bg-panel-3"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        {legendEntries(colorBy, nodes).map((e) => (
          <div key={e.label} className="flex items-center gap-2">
            <span style={{ background: e.color }} className="h-2.5 w-2.5 flex-none rounded-full" />
            <span className="truncate text-muted">{e.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-2.5">
        <span className="font-semibold tracking-[0.1em] text-faint uppercase">Layers</span>
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <span className="h-[2px] w-4 flex-none rounded bg-muted" />
          Dependencies · always on
        </div>
        <Toggle
          checked={showDataSources}
          onChange={onShowDataSources}
          label="Shared data sources"
          swatch="var(--color-line-2)"
        />
        <Toggle
          checked={showCredentials}
          onChange={onShowCredentials}
          label="Credentials"
          swatch="var(--color-warn)"
        />
        <button
          onClick={onReset}
          className="mt-1 rounded-md border border-line py-1 text-muted transition-colors hover:bg-panel-3 hover:text-ink"
        >
          Reset view
        </button>
      </div>
    </div>
  );
}
