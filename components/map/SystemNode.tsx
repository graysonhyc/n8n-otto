"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type HubVariant = "resource" | "credential";

export interface SystemNodeData {
  name: string;
  faded: boolean;
  variant: HubVariant;
  system?: string; // for resource hubs: the owning app (e.g. "Google Sheets")
  [key: string]: unknown;
}

export type SystemFlowNode = Node<SystemNodeData, "system">;

const DOT: Record<HubVariant, string> = {
  resource: "var(--color-line-2)",
  credential: "var(--color-warn)",
};

export function SystemNode({ data }: NodeProps<SystemFlowNode>) {
  const dot = DOT[data.variant];
  return (
    <div
      style={{ opacity: data.faded ? 0.22 : 1 }}
      className="flex h-[40px] w-[164px] items-center gap-2 rounded-full border border-dashed border-line-2 bg-panel px-3 text-[11.5px] text-muted transition-opacity"
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-2" />
      <span style={{ background: dot }} className="h-1.5 w-1.5 flex-none rounded-full" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{data.name}</span>
        {data.variant === "credential" ? (
          <span className="truncate text-[9px] tracking-wide text-faint uppercase">credential</span>
        ) : (
          data.system && <span className="truncate text-[9px] text-faint">{data.system}</span>
        )}
      </span>
    </div>
  );
}
