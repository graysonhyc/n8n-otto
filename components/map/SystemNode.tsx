"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export interface SystemNodeData {
  name: string;
  faded: boolean;
  [key: string]: unknown;
}

export type SystemFlowNode = Node<SystemNodeData, "system">;

export function SystemNode({ data }: NodeProps<SystemFlowNode>) {
  return (
    <div
      style={{ opacity: data.faded ? 0.22 : 1 }}
      className="flex h-[40px] w-[148px] items-center gap-2 rounded-full border border-dashed border-line-2 bg-panel px-3 text-[11.5px] text-muted transition-opacity"
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-2" />
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-line-2" />
      <span className="truncate">{data.name}</span>
    </div>
  );
}
