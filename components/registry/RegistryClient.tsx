"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RegistryItem } from "@/lib/derive/registry";
import type { WorkflowType } from "@/lib/n8n/types";
import { Pill } from "@/components/ui/Pill";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import {
  TYPE_LABEL,
  criticalityTone,
  relativeTime,
  riskTone,
  typeTone,
} from "@/lib/format";
import { OwnerAssign } from "./OwnerAssign";

// Sentinel select value meaning "no owner assigned" (distinct from "All").
const UNASSIGNED = "__unassigned__";

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

// Sortable columns and how each row maps to a comparable value.
type SortKey = "name" | "type" | "owner" | "criticality" | "lastChange" | "risk";
const CRIT_RANK = { High: 0, Medium: 1, Low: 2 } as const;
const RISK_RANK = { high: 0, medium: 1, low: 2 } as const;

function sortValue(i: RegistryItem, key: SortKey): string | number {
  switch (key) {
    case "type":
      return TYPE_LABEL[i.type];
    case "owner":
      return i.owner?.team?.toLowerCase() ?? "~"; // unassigned sorts last
    case "criticality":
      return CRIT_RANK[i.criticality];
    case "lastChange":
      return i.lastChange ? new Date(i.lastChange).getTime() : 0;
    case "risk":
      return RISK_RANK[i.risk.level];
    default:
      return i.name.toLowerCase();
  }
}

const COLUMNS: { label: string; sort?: SortKey }[] = [
  { label: "Name", sort: "name" },
  { label: "Type", sort: "type" },
  { label: "Owner", sort: "owner" },
  { label: "Crit.", sort: "criticality" },
  { label: "AI" },
  { label: "Systems" },
  { label: "Last change", sort: "lastChange" },
  { label: "Risk", sort: "risk" },
];

export function RegistryClient({ items }: { items: RegistryItem[] }) {
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const [owner, setOwner] = useState("");
  const [channel, setChannel] = useState("");
  const [type, setType] = useState<WorkflowType | "">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "risk", dir: 1 });

  const owners = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.owner?.team).filter((t): t is string => !!t)),
      ).sort(),
    [items],
  );
  const channels = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.owner?.slackChannelName).filter((c): c is string => !!c)),
      ).sort(),
    [items],
  );
  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items]);

  const rows = useMemo(() => {
    const tests = FILTERS.filter((f) => active.has(f.key)).map((f) => f.test);
    const filtered = items.filter(
      (i) =>
        tests.every((t) => t(i)) &&
        (owner === "" || (owner === UNASSIGNED ? !i.owner : i.owner?.team === owner)) &&
        (channel === "" || i.owner?.slackChannelName === channel) &&
        (type === "" || i.type === type),
    );
    return filtered.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [items, active, owner, channel, type, sort]);

  function toggle(key: FilterKey) {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const hasFilters = active.size > 0 || owner !== "" || channel !== "" || type !== "";
  function reset() {
    setActive(new Set());
    setOwner("");
    setChannel("");
    setType("");
  }

  const selectClass =
    "rounded-md border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:bg-panel-3 focus:border-accent focus:outline-none";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={selectClass}>
          <option value="">All owners</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select aria-label="Filter by channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={selectClass}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as WorkflowType | "")} className={selectClass}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={reset}
            className="rounded-md border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = active.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                on
                  ? "border-accent-line bg-accent-dim text-white"
                  : "border-line-2 bg-panel-2 text-muted hover:border-[#444754] hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const sorted = col.sort && sort.key === col.sort;
                  return (
                    <th
                      key={col.label}
                      onClick={col.sort ? () => toggleSort(col.sort!) : undefined}
                      className={`border-b border-line bg-panel px-3 py-2.5 text-left text-[10.5px] font-semibold tracking-wider whitespace-nowrap uppercase ${
                        col.sort ? "cursor-pointer select-none hover:text-muted" : ""
                      } ${sorted ? "text-ink" : "text-faint"}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sorted && (
                          <span className="text-accent">{sort.dir === 1 ? "▼" : "▲"}</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-line transition-colors last:border-0 hover:bg-panel-3">
                  <td className="px-3 py-2.5">
                    <Link href={`/workflow/${i.id}`} className="font-semibold text-ink hover:text-accent">
                      {i.name}
                    </Link>
                    <div className="font-mono text-[11px] text-faint">{i.id}</div>
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
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted nums">
                    {relativeTime(i.lastChange)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill tone={riskTone(i.risk)}>{i.risk.label}</Pill>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-3 py-12 text-center">
                    <Icon name="search" size={26} className="mx-auto mb-2 text-faint" />
                    <div className="text-sm text-muted">No workflows match these filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
