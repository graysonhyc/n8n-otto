"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ColorBy, GraphEdge, GraphNode, WorkflowGraph } from "@/lib/derive/graph";
import { TYPE_LABEL } from "@/lib/format";
import { colorFor } from "./legend";
import { layout } from "./layout";
import { WorkflowNode } from "./WorkflowNode";
import { SystemNode } from "./SystemNode";
import { GroupNode } from "./GroupNode";
import { MapControls } from "./MapControls";

const nodeTypes = { workflow: WorkflowNode, system: SystemNode, group: GroupNode };

function edgeStyle(kind: GraphEdge["kind"]): Partial<Edge> {
  switch (kind) {
    case "calls":
      return {
        style: { stroke: "var(--color-muted)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-muted)" },
        animated: false,
      };
    case "manual":
      return {
        style: { stroke: "var(--color-accent)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-accent)" },
      };
    case "subworkflow-tool":
      return {
        style: { stroke: "var(--color-ai)", strokeWidth: 1.5, strokeDasharray: "6 3" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-ai)" },
        animated: false,
      };
    case "shares-credential":
      return { style: { stroke: "var(--color-warn)", strokeWidth: 1.25, strokeDasharray: "5 4" } };
    case "uses-system":
    case "uses-resource":
    case "uses-credential":
      return { style: { stroke: "var(--color-line-2)", strokeWidth: 1, strokeDasharray: "2 3" } };
  }
}

function Canvas({ graph, live }: { graph: WorkflowGraph; live: boolean }) {
  const router = useRouter();
  const { fitView } = useReactFlow();
  const [colorBy, setColorBy] = useState<ColorBy>("risk");
  const [showSystems, setShowSystems] = useState(true);
  const [showHeuristic, setShowHeuristic] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  const onRename = useCallback(
    (key: string, name: string) => {
      void fetch("/api/process-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name }),
      }).then(() => router.refresh());
    },
    [router],
  );

  // Filter nodes/edges per the active toggles.
  const filtered = useMemo(() => {
    const nodes = graph.nodes.filter((n) => (n.kind === "system" ? showSystems : true));
    const present = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => {
      if (e.kind === "uses-system" && (!showSystems || !showHeuristic)) return false;
      return present.has(e.source) && present.has(e.target);
    });
    return { nodes, edges };
  }, [graph, showSystems, showHeuristic]);

  const laid = useMemo(
    () => layout(filtered.nodes, filtered.edges, graph.groups),
    [filtered, graph.groups],
  );
  const posById = useMemo(() => new Map(laid.nodes.map((n) => [n.id, n])), [laid]);

  // Neighbor set for hover highlight.
  const neighbors = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>([hovered]);
    for (const e of filtered.edges) {
      if (e.source === hovered) set.add(e.target);
      if (e.target === hovered) set.add(e.source);
    }
    return set;
  }, [hovered, filtered.edges]);

  const rfNodes = useMemo<Node[]>(() => {
    const groupNodes: Node[] = laid.groups.map((b) => ({
      id: b.id,
      type: "group",
      position: { x: b.x, y: b.y },
      data: { name: b.name, groupKey: b.id, onRename },
      style: { width: b.width, height: b.height },
      selectable: false,
      draggable: false,
      zIndex: 0,
    }));

    const contentNodes: Node[] = filtered.nodes.map((n) => {
      const p = posById.get(n.id)!;
      const faded = neighbors ? !neighbors.has(n.id) : false;
      const base = {
        id: n.id,
        position: { x: p.x, y: p.y },
        parentId: p.parentId,
        extent: p.parentId ? ("parent" as const) : undefined,
        draggable: false,
        zIndex: 1,
      };
      if (n.kind !== "workflow") {
        return { ...base, type: "system", data: { name: n.name, faded } };
      }
      return {
        ...base,
        type: "workflow",
        data: {
          name: n.name,
          typeLabel: TYPE_LABEL[n.type],
          color: colorFor(n, colorBy),
          failures: n.recentFailures,
          faded,
        },
      };
    });

    return [...groupNodes, ...contentNodes];
  }, [laid.groups, filtered.nodes, posById, neighbors, colorBy, onRename]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      filtered.edges.map((e) => {
        const faded = neighbors ? !(neighbors.has(e.source) && neighbors.has(e.target)) : false;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.kind === "manual" || e.kind === "shares-credential" ? e.label : undefined,
          labelStyle: { fill: "var(--color-faint)", fontSize: 10 },
          labelBgStyle: { fill: "var(--color-panel)" },
          ...edgeStyle(e.kind),
          style: { ...edgeStyle(e.kind).style, opacity: faded ? 0.12 : 1 },
        };
      }),
    [filtered.edges, neighbors],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (node.type === "workflow") router.push(`/workflow/${node.id}`);
    },
    [router],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="grid flex-1 place-items-center rounded-xl border border-line bg-panel text-[13px] text-muted">
        No workflows yet — connect an n8n instance or run the demo seed.
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden rounded-xl border border-line bg-panel">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, n) => n.type !== "group" && setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="var(--color-line)" gap={22} />
        <MiniMap pannable zoomable className="!bg-panel-2" maskColor="rgba(0,0,0,0.6)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <MapControls
        colorBy={colorBy}
        onColorBy={setColorBy}
        showSystems={showSystems}
        onShowSystems={setShowSystems}
        showHeuristic={showHeuristic}
        onShowHeuristic={setShowHeuristic}
        onReset={() => fitView({ duration: 300 })}
        nodes={graph.nodes as GraphNode[]}
        live={live}
      />
    </div>
  );
}

export function MapCanvas({ graph, live }: { graph: WorkflowGraph; live: boolean }) {
  return (
    <ReactFlowProvider>
      <Canvas graph={graph} live={live} />
    </ReactFlowProvider>
  );
}
