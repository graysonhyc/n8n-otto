"use client";

import { useState } from "react";
import { type Node, type NodeProps } from "@xyflow/react";

export interface GroupNodeData {
  name: string;
  groupKey: string;
  onRename?: (key: string, name: string) => void;
  [key: string]: unknown;
}

export type GroupFlowNode = Node<GroupNodeData, "group">;

export function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.name);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== data.name) data.onRename?.(data.groupKey, next);
    else setValue(data.name);
  };

  return (
    <div className="h-full w-full rounded-xl border border-dashed border-accent-line bg-accent-dim/30">
      <div className="absolute -top-[11px] left-3">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setValue(data.name);
                setEditing(false);
              }
            }}
            maxLength={60}
            className="nodrag rounded-full border border-accent-line bg-panel px-2.5 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-ink uppercase outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setValue(data.name);
              setEditing(true);
            }}
            className="nodrag rounded-full border border-accent-line bg-panel px-2.5 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-accent uppercase hover:text-ink"
            title="Rename process"
          >
            {data.name}
          </button>
        )}
      </div>
    </div>
  );
}
