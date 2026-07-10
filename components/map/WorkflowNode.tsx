"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export interface WorkflowNodeData {
  name: string;
  typeLabel: string;
  color: string;
  failures: number;
  faded: boolean;
  [key: string]: unknown;
}

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;

export function WorkflowNode({ data }: NodeProps<WorkflowFlowNode>) {
  return (
    <div
      style={{ borderColor: data.color, opacity: data.faded ? 0.22 : 1 }}
      className="w-[200px] cursor-pointer rounded-lg border-l-[3px] border border-line bg-panel-2 px-3 py-2 shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-opacity hover:bg-panel-3"
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-2" />
      <div className="flex items-center gap-2">
        <span style={{ background: data.color }} className="h-2 w-2 flex-none rounded-full" />
        <span className="truncate text-[12.5px] font-medium text-ink">{data.name}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
        <span>{data.typeLabel}</span>
        {data.failures > 0 && (
          <span className="text-danger">● {data.failures} recent fail</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line-2" />
    </div>
  );
}
