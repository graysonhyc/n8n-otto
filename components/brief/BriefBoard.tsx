"use client";

import { useMemo, useState } from "react";
import type { BriefItem, Severity } from "@/lib/brief/build";
import { BriefCard } from "./BriefCard";
import { Icon } from "@/components/ui/Icon";

type FilterKey = "all" | "high" | "unowned" | "change";

const FILTERS: { key: FilterKey; label: string; test: (i: BriefItem) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "high", label: "High", test: (i) => i.severity === "high" },
  { key: "unowned", label: "Unowned", test: (i) => i.suggestedOwner === "Unassigned" },
  { key: "change", label: "Changed", test: (i) => i.category === "change" },
];

const GROUPS: { sev: Severity; label: string; color: string }[] = [
  { sev: "high", label: "High priority", color: "var(--color-danger)" },
  { sev: "medium", label: "Medium", color: "var(--color-warn)" },
  { sev: "low", label: "Low", color: "#5a5d68" },
];

function Stat({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string | number;
  detail: string;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-panel-2 px-4 py-3.5">
      <span className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="text-[11px] font-semibold tracking-wide text-faint uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-[27px] font-semibold tracking-[-0.02em] nums">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-muted">{detail}</div>
    </div>
  );
}

export function BriefBoard({ items, scanned }: { items: BriefItem[]; scanned: number }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [compact, setCompact] = useState(false);

  const counts = useMemo(
    () => ({
      all: items.length,
      high: items.filter((i) => i.severity === "high").length,
      unowned: items.filter((i) => i.suggestedOwner === "Unassigned").length,
      change: items.filter((i) => i.category === "change").length,
      ownership: items.filter((i) => i.category === "ownership").length,
    }),
    [items],
  );

  const active = FILTERS.find((f) => f.key === filter)!.test;
  const visible = items.filter(active);

  return (
    <>
      <div className="mb-4.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Needs attention" value={counts.all} detail={`${scanned} workflows scanned`} color="var(--color-danger)" />
        <Stat label="High priority" value={counts.high} detail="review before next run" color="var(--color-change)" />
        <Stat label="Recent changes" value={counts.change} detail="behaviour or config edits" color="var(--color-warn)" />
        <Stat label="Ownership gaps" value={counts.ownership} detail="no accountable owner" color="var(--color-ok)" />
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex h-[29px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
                on
                  ? "border-accent-line bg-accent-dim text-white"
                  : "border-line-2 bg-panel-2 text-muted hover:border-[#444754] hover:text-ink"
              }`}
            >
              {f.label}
              <span className={`font-mono text-[11px] ${on ? "text-accent" : "text-faint"}`}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="inline-flex overflow-hidden rounded-md border border-line-2">
          {[
            { k: false, label: "Comfortable" },
            { k: true, label: "Compact" },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => setCompact(o.k)}
              className={`px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                compact === o.k ? "bg-panel-3 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-2 bg-panel-2/60 px-5 py-14 text-center">
          <Icon name="check" size={30} className="mx-auto mb-3 text-ok" strokeWidth={2} />
          <h3 className="text-[15px] font-semibold">All clear</h3>
          <p className="mt-1 text-[13px] text-muted">
            No risky changes, ownership gaps, or shared-resource risks in this filter.
          </p>
        </div>
      ) : (
        <div className="max-w-3xl">
          {GROUPS.map((g) => {
            const rows = visible.filter((i) => i.severity === g.sev);
            if (!rows.length) return null;
            return (
              <div key={g.sev}>
                <div className="mt-5 mb-2.5 flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: g.color }} />
                  <h2 className="text-[12px] font-semibold tracking-[0.07em] text-muted uppercase">
                    {g.label}
                  </h2>
                  <span className="font-mono text-[11px] text-faint">{rows.length}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
                  {rows.map((item) => (
                    <BriefCard key={item.key} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
