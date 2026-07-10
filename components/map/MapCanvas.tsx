"use client";

import type { WorkflowGraph } from "@/lib/derive/graph";

export function MapCanvas({ graph, live }: { graph: WorkflowGraph; live: boolean }) {
  // Placeholder — replaced with the React Flow canvas in Chunk 3.
  return (
    <div className="rounded-xl border border-line bg-panel p-4 text-[13px] text-muted">
      <div>live: {String(live)}</div>
      <div>
        {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.groups.length} groups
      </div>
    </div>
  );
}
