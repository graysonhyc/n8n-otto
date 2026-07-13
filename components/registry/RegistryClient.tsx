"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RegistryItem } from "@/lib/derive/registry";
import type { WorkflowType } from "@/lib/n8n/types";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { TYPE_LABEL, relativeTime, typeTone } from "@/lib/format";
import { OwnerAssign } from "./OwnerAssign";

// Sentinel select value meaning "no owner assigned" (distinct from "All").
const UNASSIGNED = "__unassigned__";

// Sortable columns and how each row maps to a comparable value.
type SortKey = "name" | "type" | "owner" | "lastChange";

function sortValue(i: RegistryItem, key: SortKey): string | number {
  switch (key) {
    case "type":
      return TYPE_LABEL[i.type];
    case "owner":
      return (i.owner?.slackChannelName ?? i.owner?.team)?.toLowerCase() ?? "~"; // unassigned sorts last
    case "lastChange":
      return i.lastChange ? new Date(i.lastChange).getTime() : 0;
    default:
      return i.name.toLowerCase();
  }
}

const COLUMNS: { label: string; sort?: SortKey }[] = [
  { label: "Name", sort: "name" },
  { label: "Type", sort: "type" },
  { label: "Channel", sort: "owner" },
  { label: "Systems" },
  { label: "Last change", sort: "lastChange" },
];

export function RegistryClient({ items }: { items: RegistryItem[] }) {
  const [channel, setChannel] = useState("");
  const [type, setType] = useState<WorkflowType | "">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "lastChange", dir: -1 });

  const channels = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.owner?.slackChannelName).filter((c): c is string => !!c)),
      ).sort(),
    [items],
  );
  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items]);

  const rows = useMemo(() => {
    const filtered = items.filter(
      (i) =>
        (channel === "" ||
          (channel === UNASSIGNED ? !i.owner : i.owner?.slackChannelName === channel)) &&
        (type === "" || i.type === type),
    );
    return filtered.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [items, channel, type, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const hasFilters = channel !== "" || type !== "";
  function reset() {
    setChannel("");
    setType("");
  }

  const selectClass =
    "rounded-md border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:bg-panel-3 focus:border-accent focus:outline-none";

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <select aria-label="Filter by channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={selectClass}>
          <option value="">All channels</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              #{c}
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
                  <td className="px-3 py-2.5 text-[11.5px] text-muted">
                    {i.systems.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted nums">
                    {relativeTime(i.lastChange)}
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
