"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RegistryItem } from "@/lib/derive/registry";
import { Pill } from "@/components/ui/Pill";
import { Chip } from "@/components/ui/Chip";
import {
  TYPE_LABEL,
  criticalityTone,
  relativeTime,
  riskTone,
  typeTone,
} from "@/lib/format";
import { OwnerAssign } from "./OwnerAssign";

type FilterKey =
  | "uses-ai"
  | "tool-access"
  | "no-owner"
  | "customer-facing"
  | "recently-changed"
  | "stale"
  | "prod-critical";

const FILTERS: { key: FilterKey; label: string; test: (i: RegistryItem) => boolean }[] = [
  { key: "uses-ai", label: "Uses AI", test: (i) => i.usesAI },
  { key: "tool-access", label: "Has tool access", test: (i) => i.hasToolAccess },
  { key: "no-owner", label: "No owner", test: (i) => !i.owner },
  { key: "customer-facing", label: "Customer-facing", test: (i) => i.criticality === "High" },
  {
    key: "recently-changed",
    label: "Recently changed",
    test: (i) => !!i.lastChange && Date.now() - new Date(i.lastChange).getTime() < 7 * 86400000,
  },
  {
    key: "stale",
    label: "Stale",
    test: (i) => !!i.lastChange && Date.now() - new Date(i.lastChange).getTime() > 60 * 86400000,
  },
  { key: "prod-critical", label: "Prod-critical", test: (i) => i.active && i.criticality === "High" },
];

export function RegistryClient({ items }: { items: RegistryItem[] }) {
  const [active, setActive] = useState<Set<FilterKey>>(new Set());

  const rows = useMemo(() => {
    const tests = FILTERS.filter((f) => active.has(f.key)).map((f) => f.test);
    return items.filter((i) => tests.every((t) => t(i)));
  }, [items, active]);

  function toggle(key: FilterKey) {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <>
      <div className="mb-3.5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = active.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                on
                  ? "border-accent-dim bg-accent-dim text-accent"
                  : "border-line bg-panel-3 text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["Name", "Type", "Owner", "Crit.", "AI", "Systems", "Last change", "Risk"].map(
                (h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-line bg-[#101015] px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-faint"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                <td className="px-3 py-2.5">
                  <Link href={`/workflow/${i.id}`} className="font-semibold text-ink hover:text-accent">
                    {i.name}
                  </Link>
                  <div className="text-[11.5px] text-muted">
                    {i.project ?? "—"}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Pill tone={typeTone(i.type)}>{TYPE_LABEL[i.type]}</Pill>
                </td>
                <td className="px-3 py-2.5">
                  <OwnerAssign item={i} />
                </td>
                <td className="px-3 py-2.5">
                  <Pill tone={criticalityTone(i.criticality)} dot={false}>
                    {i.criticality}
                  </Pill>
                </td>
                <td className="px-3 py-2.5">
                  {i.hasToolAccess ? (
                    <Chip tone="ai">tools</Chip>
                  ) : i.usesAI ? (
                    <Chip tone="ai">AI</Chip>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11.5px] text-muted">
                  {i.systems.join(", ") || "—"}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-[11.5px] text-muted">
                  {relativeTime(i.lastChange)}
                </td>
                <td className="px-3 py-2.5">
                  <Pill tone={riskTone(i.risk)}>{i.risk.label}</Pill>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted">
                  No workflows match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
